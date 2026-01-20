import {
  Inviter,
  Registerer,
  SessionState,
  UserAgent,
  Web,
} from "https://unpkg.com/sip.js@0.21.2/dist/sip.js?module";
import { widgetConfig } from "./config.js";

const launcherBtn = document.getElementById("launcherBtn");
const statusEl = document.getElementById("status");
const widget = document.getElementById("widget");
const destinationsEl = document.getElementById("destinations");
const audioCallBtn = document.getElementById("audioCallBtn");
const videoCallBtn = document.getElementById("videoCallBtn");
const hangupBtn = document.getElementById("hangupBtn");
const holdBtn = document.getElementById("holdBtn");
const muteBtn = document.getElementById("muteBtn");
const transferBtn = document.getElementById("transferBtn");
const transferTarget = document.getElementById("transferTarget");
const recordBtn = document.getElementById("recordBtn");
const stunTestBtn = document.getElementById("stunTestBtn");
const logEl = document.getElementById("log");
const mediaPanel = document.getElementById("mediaPanel");
const remoteVideo = document.getElementById("remoteVideo");
const localVideo = document.getElementById("localVideo");
const whiteboard = document.getElementById("whiteboard");
const whiteboardBtn = document.getElementById("whiteboardBtn");
const shareBtn = document.getElementById("shareBtn");

let userAgent;
let registerer;
let session;
let localStream;
let remoteStream;
let recorder;
let recordChunks = [];
let isMuted = false;
let isOnHold = false;
let isRecording = false;
let isVideoCall = false;
let isSharing = false;
let originalVideoTrack;
let whiteboardActive = false;

const log = (message) => {
  const entry = document.createElement("div");
  entry.textContent = `[${new Date().toLocaleTimeString("fa-IR")}] ${message}`;
  logEl.prepend(entry);
};

const setStatus = (message) => {
  statusEl.textContent = message;
};

const setButtonsForCall = (active) => {
  hangupBtn.disabled = !active;
  holdBtn.disabled = !active;
  muteBtn.disabled = !active;
  transferBtn.disabled = !active;
  recordBtn.disabled = !active;
  whiteboardBtn.disabled = !active || !isVideoCall;
  shareBtn.disabled = !active || !isVideoCall;
};

const resetCallState = () => {
  isMuted = false;
  isOnHold = false;
  isRecording = false;
  isVideoCall = false;
  isSharing = false;
  originalVideoTrack = undefined;
  muteBtn.textContent = "Mute";
  holdBtn.textContent = "Hold";
  recordBtn.textContent = "شروع ضبط";
  shareBtn.textContent = "اشتراک دسکتاپ";
  whiteboardBtn.textContent = "تخته وایت‌برد";
  mediaPanel.hidden = true;
  whiteboard.hidden = true;
  whiteboardActive = false;
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  localStream = undefined;
  remoteStream = undefined;
};

const renderDestinations = () => {
  destinationsEl.innerHTML = "";
  widgetConfig.destinations.forEach((dest, index) => {
    const wrapper = document.createElement("label");
    wrapper.className = "destination";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "destination";
    radio.value = dest.extension;
    if (index === 0) {
      radio.checked = true;
    }
    const text = document.createElement("span");
    text.textContent = `${dest.label} (${dest.extension})`;
    wrapper.append(radio, text);
    destinationsEl.appendChild(wrapper);
  });
};

const getSelectedExtension = () => {
  const selected = document.querySelector("input[name='destination']:checked");
  return selected ? selected.value : widgetConfig.destinations[0]?.extension;
};

const setupVideoPanel = () => {
  if (!widgetConfig.enableVideo) {
    videoCallBtn.hidden = true;
    mediaPanel.hidden = true;
  }
};

const setupCanvas = () => {
  const resize = () => {
    whiteboard.width = remoteVideo.clientWidth;
    whiteboard.height = remoteVideo.clientHeight;
  };

  const context = whiteboard.getContext("2d");
  context.lineWidth = 3;
  context.lineCap = "round";
  context.strokeStyle = "#ff4b4b";

  let drawing = false;

  const start = (event) => {
    drawing = true;
    const { offsetX, offsetY } = getOffset(event);
    context.beginPath();
    context.moveTo(offsetX, offsetY);
  };

  const draw = (event) => {
    if (!drawing) return;
    const { offsetX, offsetY } = getOffset(event);
    context.lineTo(offsetX, offsetY);
    context.stroke();
  };

  const stop = () => {
    drawing = false;
  };

  const getOffset = (event) => {
    if (event.touches) {
      const rect = whiteboard.getBoundingClientRect();
      return {
        offsetX: event.touches[0].clientX - rect.left,
        offsetY: event.touches[0].clientY - rect.top,
      };
    }
    return { offsetX: event.offsetX, offsetY: event.offsetY };
  };

  whiteboard.addEventListener("mousedown", start);
  whiteboard.addEventListener("mousemove", draw);
  whiteboard.addEventListener("mouseup", stop);
  whiteboard.addEventListener("mouseleave", stop);
  whiteboard.addEventListener("touchstart", (event) => {
    event.preventDefault();
    start(event);
  });
  whiteboard.addEventListener("touchmove", (event) => {
    event.preventDefault();
    draw(event);
  });
  whiteboard.addEventListener("touchend", stop);

  window.addEventListener("resize", resize);
  resize();
};

const bindSession = (activeSession, videoEnabled) => {
  session = activeSession;
  isVideoCall = videoEnabled;
  setButtonsForCall(true);
  if (videoEnabled) {
    mediaPanel.hidden = false;
  }

  session.stateChange.addListener((state) => {
    if (state === SessionState.Established) {
      log("تماس برقرار شد.");
      attachMedia();
    }
    if (state === SessionState.Terminated) {
      log("تماس پایان یافت.");
      setButtonsForCall(false);
      resetCallState();
      session = undefined;
    }
  });
};

const attachMedia = () => {
  if (!session?.sessionDescriptionHandler) {
    return;
  }
  const pc = session.sessionDescriptionHandler.peerConnection;
  remoteStream = new MediaStream();
  localStream = new MediaStream();

  pc.getReceivers().forEach((receiver) => {
    if (receiver.track) {
      remoteStream.addTrack(receiver.track);
    }
  });

  pc.getSenders().forEach((sender) => {
    if (sender.track) {
      localStream.addTrack(sender.track);
    }
  });

  remoteVideo.srcObject = remoteStream;
  localVideo.srcObject = localStream;
};

const buildWebsocketUrl = () => {
  if (widgetConfig.sip.websocketUrl) {
    return widgetConfig.sip.websocketUrl;
  }
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const port = widgetConfig.sip.port ? `:${widgetConfig.sip.port}` : "";
  const path = widgetConfig.sip.path || "";
  return `${scheme}://${widgetConfig.sip.host}${port}${path}`;
};

const registerUser = async () => {
  if (userAgent) {
    widget.hidden = false;
    return;
  }
  try {
    setStatus("در حال اتصال و رجیستر...");
    const uri = UserAgent.makeURI(`sip:${widgetConfig.sip.user}@${widgetConfig.sip.domain}`);
    userAgent = new UserAgent({
      uri,
      displayName: widgetConfig.sip.displayName,
      authorizationUsername: widgetConfig.sip.user,
      authorizationPassword: widgetConfig.sip.password,
      transportOptions: {
        server: buildWebsocketUrl(),
      },
      sessionDescriptionHandlerFactoryOptions: {
        peerConnectionConfiguration: {
          iceServers: widgetConfig.iceServers,
        },
      },
    });

    registerer = new Registerer(userAgent);
    await userAgent.start();
    await registerer.register();

    widget.hidden = false;
    setStatus("ثبت موفق بود. آماده تماس هستید.");
    audioCallBtn.disabled = false;
    if (widgetConfig.enableVideo) {
      videoCallBtn.disabled = false;
    }
    log("رجیستر SIP انجام شد.");
  } catch (error) {
    setStatus("ثبت انجام نشد. تنظیمات را بررسی کنید.");
    log(`خطا در رجیستر: ${error?.message ?? error}`);
  }
};

const startCall = async (videoEnabled) => {
  if (!userAgent) return;
  const extension = getSelectedExtension();
  if (!extension) {
    log("هیچ مقصدی انتخاب نشده است.");
    return;
  }
  try {
    const target = UserAgent.makeURI(`sip:${extension}@${widgetConfig.sip.domain}`);
    const inviter = new Inviter(userAgent, target, {
      sessionDescriptionHandlerOptions: {
        constraints: {
          audio: true,
          video: videoEnabled,
        },
        peerConnectionOptions: {
          rtcConfiguration: {
            iceServers: widgetConfig.iceServers,
          },
        },
      },
    });
    bindSession(inviter, videoEnabled);
    await inviter.invite();
    log(`در حال تماس با داخلی ${extension}...`);
  } catch (error) {
    log(`خطا در برقراری تماس: ${error?.message ?? error}`);
  }
};

const toggleMute = () => {
  if (!localStream) return;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = isMuted;
  });
  isMuted = !isMuted;
  muteBtn.textContent = isMuted ? "Unmute" : "Mute";
};

const toggleHold = async () => {
  if (!session) return;
  try {
    if (!isOnHold) {
      await session.invite({
        sessionDescriptionHandlerModifiers: [Web.holdModifier],
      });
      isOnHold = true;
      holdBtn.textContent = "Unhold";
      log("تماس روی حالت hold قرار گرفت.");
    } else {
      await session.invite({
        sessionDescriptionHandlerModifiers: [Web.unholdModifier],
      });
      isOnHold = false;
      holdBtn.textContent = "Hold";
      log("تماس از حالت hold خارج شد.");
    }
  } catch (error) {
    log(`خطا در hold: ${error?.message ?? error}`);
  }
};

const transferCall = async () => {
  if (!session) return;
  const targetExtension = transferTarget.value.trim();
  if (!targetExtension) {
    log("برای انتقال، داخلی مقصد را وارد کنید.");
    return;
  }
  try {
    const target = UserAgent.makeURI(`sip:${targetExtension}@${widgetConfig.sip.domain}`);
    await session.refer(target);
    log(`تماس به داخلی ${targetExtension} منتقل شد.`);
  } catch (error) {
    log(`خطا در انتقال تماس: ${error?.message ?? error}`);
  }
};

const hangupCall = async () => {
  if (!session) return;
  try {
    if (session.state === SessionState.Established) {
      await session.bye();
    } else {
      await session.cancel();
    }
  } catch (error) {
    log(`خطا در قطع تماس: ${error?.message ?? error}`);
  }
};

const toggleRecording = () => {
  if (!session || !remoteStream) return;
  if (!isRecording) {
    const combined = new MediaStream();
    remoteStream.getTracks().forEach((track) => combined.addTrack(track));
    localStream?.getTracks().forEach((track) => combined.addTrack(track));
    recorder = new MediaRecorder(combined, widgetConfig.recording);
    recordChunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordChunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      const blob = new Blob(recordChunks, { type: recorder.mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `call-recording-${Date.now()}.webm`;
      anchor.click();
      URL.revokeObjectURL(url);
    };
    recorder.start();
    isRecording = true;
    recordBtn.textContent = "توقف ضبط";
    log("ضبط تماس شروع شد.");
  } else {
    recorder?.stop();
    isRecording = false;
    recordBtn.textContent = "شروع ضبط";
    log("ضبط تماس متوقف شد.");
  }
};

const toggleScreenShare = async () => {
  if (!session || !isVideoCall) return;
  try {
    if (!isSharing) {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      const sender = session.sessionDescriptionHandler.peerConnection
        .getSenders()
        .find((item) => item.track?.kind === "video");
      if (sender && track) {
        originalVideoTrack = sender.track;
        await sender.replaceTrack(track);
        track.onended = () => toggleScreenShare();
        isSharing = true;
        shareBtn.textContent = "توقف اشتراک";
        log("اشتراک دسکتاپ فعال شد.");
      }
    } else if (originalVideoTrack) {
      const sender = session.sessionDescriptionHandler.peerConnection
        .getSenders()
        .find((item) => item.track?.kind === "video");
      await sender.replaceTrack(originalVideoTrack);
      isSharing = false;
      shareBtn.textContent = "اشتراک دسکتاپ";
      log("اشتراک دسکتاپ متوقف شد.");
    }
  } catch (error) {
    log(`خطا در اشتراک دسکتاپ: ${error?.message ?? error}`);
  }
};

const toggleWhiteboard = () => {
  if (!isVideoCall) return;
  whiteboardActive = !whiteboardActive;
  whiteboard.hidden = !whiteboardActive;
  whiteboardBtn.textContent = whiteboardActive
    ? "پنهان کردن وایت‌برد"
    : "تخته وایت‌برد";
};

const testIceServers = async () => {
  const pc = new RTCPeerConnection({ iceServers: widgetConfig.iceServers });
  pc.createDataChannel("test");
  log("تست STUN/TURN شروع شد...");
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      log(`کاندید ICE: ${event.candidate.type} - ${event.candidate.address || ""}`);
    } else {
      log("تست STUN/TURN پایان یافت.");
      pc.close();
    }
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
};

const applyUiConfig = () => {
  document.documentElement.style.setProperty("--widget-font", widgetConfig.ui.fontFamily);
  document.documentElement.style.setProperty("--widget-direction", widgetConfig.ui.direction);
  launcherBtn.classList.add(`position-${widgetConfig.ui.floatingButtonPosition}`);
  widget.classList.add(`position-${widgetConfig.ui.widgetPosition}`);
};

launcherBtn.addEventListener("click", registerUser);
audioCallBtn.addEventListener("click", () => startCall(false));
videoCallBtn.addEventListener("click", () => startCall(true));
hangupBtn.addEventListener("click", hangupCall);
muteBtn.addEventListener("click", toggleMute);
holdBtn.addEventListener("click", toggleHold);
transferBtn.addEventListener("click", transferCall);
recordBtn.addEventListener("click", toggleRecording);
whiteboardBtn.addEventListener("click", toggleWhiteboard);
shareBtn.addEventListener("click", toggleScreenShare);
stunTestBtn.addEventListener("click", testIceServers);

applyUiConfig();
renderDestinations();
setupVideoPanel();
setupCanvas();
setButtonsForCall(false);
