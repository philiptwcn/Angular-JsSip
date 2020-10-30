import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import * as JsSIP from 'jssip';
import { RTCSession, RTCSessionEventMap, IncomingEvent, OutgoingEvent, EndEvent, PeerConnectionEvent, ConnectingEvent, SDPEvent } from 'jssip/lib/RTCSession';
import { CallOptions, RTCSessionEvent, IncomingMessageEvent, OutgoingMessageEvent } from 'jssip/lib/UA';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'JsSip-Angular';
  @ViewChild('localAudio')  public localAudioElement: ElementRef;
  @ViewChild('remoteAudio')  public remoteAudioElement: ElementRef;

  showLocalAudio = false;
  showRemoteAudio = false;
  outgoingSession: RTCSession;
  incomingSession: RTCSession;
  currentSession: RTCSession;
  localAudio = new Audio();
  remoteAudio = new Audio();
  localStream: MediaStream = null;
  incomingStreams: MediaStream[];
  incomingStream: MediaStream;
  userAgent: JsSIP.UA;

  UAForm = this.fb.group({
    sipURI: [],
    sipPassword: [],
    wsURI: [],
    sipPhoneNumber: []
  });

  constraints: MediaStreamConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true
    }
  };

  // Register callbacks to desired call events
  eventHandlers: Partial<RTCSessionEventMap> = {
    progress: (e: IncomingEvent | OutgoingEvent) => {
      console.log('%cCall is in progress', 'color:black;background-color:yellow', e);
      this.openSnackBar('call is in progress');
    },
    failed: (e: EndEvent) => {
      console.error('%cCall failed: ', e);
      this.openSnackBar('call failed', 'confirmed');
    },
    ended: (e: EndEvent) => {
      console.log('%cCall ended : ', 'color:white;background-color:red', e);
      this.openSnackBar('call ended', 'confirmed');
    },
    confirmed: (e: IncomingEvent | OutgoingEvent) => {
      console.log('%cCall confirmed', 'color:black;background-color:lightgreen', e);
      this.openSnackBar('call is in progress', null, { duration: 2000 });
    },
    peerconnection: (e: PeerConnectionEvent) => {
      console.log('%cOn peerconnection', 'color:black;background-color:orange', e);
      this.openSnackBar('on peerconnection', null, { duration: 3000 });
      e.peerconnection.ontrack = (ev: RTCTrackEvent) => {
        console.log('onaddtrack from remote - ', ev);
        this.remoteAudio.srcObject = ev.streams[0];
        this.remoteAudio.play();
        this.showRemoteAudio = true;
      };
    }
  };

  callOptions: CallOptions = {
    eventHandlers: this.eventHandlers,
    mediaConstraints: {
      audio: true,
      video: false
    },
    mediaStream: this.localStream
  };

  constructor(private snackBar: MatSnackBar, private fb: FormBuilder) {
  }

  ngAfterViewInit(): void {
    this.localAudio = this.localAudioElement.nativeElement;
    this.remoteAudio = this.remoteAudioElement.nativeElement;
    try {
      this.captureLocalMedia();
    } catch (error) {
      console.log('getUserMedia() error: ' + error);
      this.openSnackBar('Get User Media Error', 'confirm');
    }
  }

  gotLocalMedia(stream: MediaStream): void {
    this.localStream = stream;
    this.localAudio.srcObject = stream;
    this.showLocalAudio = true;
    console.log('Received local media stream', stream);
    this.openSnackBar('Received local media stream', null, { duration: 2000 });
  }

  captureLocalMedia = async () => {
    console.log('Requesting local video & audio');
    const stream: MediaStream = await navigator.mediaDevices.getUserMedia(this.constraints);
    this.gotLocalMedia(stream);
  }

  testStart(): void {
    console.log(
      '%cget input info: ', 'color:black;background-color:lightgreen', '\n',
      'sip_uri = ', this.UAForm.get('sipURI').value, '\n',
      'sip_password = ', this.UAForm.get('sipPassword').value, '\n',
      'ws_uri = ', this.UAForm.get('wsURI').value
      );

    const socket = new JsSIP.WebSocketInterface(this.UAForm.get('wsURI').value);
    const configuration = {
      sockets: [socket],
      outbound_proxy_set: this.UAForm.get('wsURI').value,
      uri: this.UAForm.get('sipURI').value,
      password: this.UAForm.get('sipPassword').value,
      register: true,
      session_timers: false
    };


    this.userAgent = new JsSIP.UA(configuration);

    this.userAgent.on('registered', (registeredEvent) => {
      console.log('registered: ', registeredEvent.response.status_code, ',', registeredEvent.response.reason_phrase);
      this.openSnackBar(
        `registered:  ${registeredEvent.response.status_code} , ${registeredEvent.response.reason_phrase}`,
        null,
        { duration: 2000 }
      );
    });

    this.userAgent.on('registrationFailed', (unRegisteredEvent) => {
      console.log('registrationFailed, ', unRegisteredEvent);
      this.openSnackBar(`registrationFailed`, 'confirm');
      // console.warn("registrationFailed, ", data.response.status_code, ",", data.response.reason_phrase, " cause - ", data.cause);
    });

    this.userAgent.on('registrationExpiring', () => {
      console.warn('registrationExpiring');
      this.openSnackBar('registrationExpiring', 'confirm');
    });

    this.userAgent.on('newRTCSession', (sessionEvent: RTCSessionEvent) => {
      console.log('onNewRTCSession: ', sessionEvent);
      if (sessionEvent.originator === 'remote') { // incoming call
        this.incomingSession = sessionEvent.session;
        this.currentSession = this.incomingSession;
        console.log('incomingSession, answer the call', this.incomingSession);
        console.log('remote stream', this.incomingStream);
        this.currentSession.answer({
          mediaConstraints: this.callOptions.mediaConstraints,
          mediaStream: this.callOptions.mediaStream
        });
        this.currentSession.connection.ontrack = (ev: RTCTrackEvent) => {
          console.log('onaddtrack from remote - ', ev);
          this.remoteAudio.srcObject = ev.streams[0];
          this.remoteAudio.play();
          this.showRemoteAudio = true;
        };
      } else {
        console.log('outgoingSession');
        this.outgoingSession = sessionEvent.session;
        this.outgoingSession.on('connecting', (event: ConnectingEvent) => {
          console.log('onConnecting - ', event.request);
          this.currentSession = this.outgoingSession;
          this.outgoingSession = null;
          console.log('call session', this.currentSession);
        });
      }
      sessionEvent.session.on('accepted', (event: IncomingEvent | OutgoingEvent) => {
        console.log('onAccepted - ', event);
        if (event.originator === 'remote' && this.currentSession == null) {
          this.currentSession = this.incomingSession;
          this.incomingSession = null;
          console.log('accepted setCurrentSession - ', this.currentSession);
        }
      });
      sessionEvent.session.on('confirmed', (event: IncomingEvent | OutgoingEvent) => {
        console.log('%conConfirmed - ', 'color:black;background-color:lightgreen', event);
        if (event.originator === 'remote' && this.currentSession == null) {
          this.currentSession = this.incomingSession;
          this.incomingSession = null;
          console.log('%cconfirmed setCurrentSession - ', 'color:black;background-color:kightgreen', this.currentSession);
        }
      });
      sessionEvent.session.on('sdp', (event: SDPEvent) => {
        console.log('onSDP, type - ', event.type, ' sdp - ', event.sdp);
        // data.sdp = data.sdp.replace('UDP/TLS/RTP/SAVPF', 'RTP/SAVPF');
        // console.log('onSDP, changed sdp - ', data.sdp);
      });
      sessionEvent.session.on('progress', (event: IncomingEvent | OutgoingEvent) => {
        console.log('%conProgress - ', 'color:black;background-color:yellow', event.originator);
        if (event.originator === 'remote') {
          console.log('%conProgress, response - ', 'color:black;background-color:yellow', event.response);
        }
      });
      sessionEvent.session.on('peerconnection', (event: PeerConnectionEvent) => {
        console.log('%conPeerconnection - ', 'color:black;background-color:orange', event.peerconnection);
      });
    });

    this.userAgent.on('newMessage', (data: IncomingMessageEvent | OutgoingMessageEvent) => {
      if (data.originator === 'local') {
        console.log('onNewMessage , OutgoingRequest - ', data.request);
      } else {
        console.log('onNewMessage , IncomingRequest - ', data.request);
      }
    });

    console.log('call registered');

    this.userAgent.start();
    console.log('ua start');

  }



  testCall(): void {
    const sipPhoneNumber = this.UAForm.get('sipPhoneNumber').value;
    const options: CallOptions = this.callOptions;

    this.outgoingSession = this.userAgent.call(sipPhoneNumber, options);
  }

  // answer(): void {
  //   this.currentSession.answer({
  //     mediaConstraints: {
  //       audio: true,
  //       video: false,
  //       // mandatory: { maxWidth: 640, maxHeight: 360 }
  //     },
  //     mediaStream: this.localStream
  //   });
  //   this.currentSession.connection.ontrack = (ev: RTCTrackEvent) => {
  //     console.log('onaddtrack from remote - ', ev);
  //     this.phoneAudio.srcObject = ev.streams[0];
  //     this.phoneAudio.play();
  //   };
  // }

  hungup(): void {
    this.userAgent.terminateSessions();
    this.remoteAudio.pause();
    this.showRemoteAudio = false;
  }

  openSnackBar(message: string, action?: string, config?: object): void {
    this.snackBar.open(message, action, { ...config, panelClass: ['mat-toolbar', 'mat-primary'] });
  }

}
