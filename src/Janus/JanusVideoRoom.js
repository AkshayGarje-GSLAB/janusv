import React, { useEffect, useRef } from "react";
import Janus from "./Janus";

var global = {
  plugins: {
    videoRoom: "janus.plugin.videoroom",
  },
  server: "http://10.43.13.107:8088/janus",
  janusRoom: null,
  vroomHandle: null,
  myRoom: 9999,
  opaqueId: "videoroom-" + Janus.randomString(12),
  mypvtid: null,
  myusername: null,
  feeds: [],
  myid: null,
  mystream: null,
  iceServers: [
    {
      url: "turn:10.43.13.107:3478?transport=tcp",
      credential: "test123",
      username: "iiht",
    },
  ],
};

global.connect = () => {
  return new Promise((resolve, reject) => {
    Janus.init({
      debug: "all",
      callback: function () {
        // Make sure the browser supports WebRTC
        // Create session
        global.janusRoom = new Janus({
          server: global.server,
          iceServers: global.iceServers,
          success: function () {
            // Attach to VideoRoom plugin
            global.addLocalFeed();
          },
          error: function (error) {
            Janus.error(error);
            alert(error);
          },
          destroyed: function () {
            console.log("destroyed");
          },
        });
      },
    });
  });
};

global.addLocalFeed = function () {
  global.janusRoom.attach({
    plugin: global.plugins.videoRoom,
    opaqueId: global.opaqueId,
    success: function (pluginHandle) {
      global.vroomHandle = pluginHandle;
      let reg = Janus.randomString(12);
      const register = {
        request: "join",
        room: global.myRoom,
        ptype: "publisher",
        display: reg,
      };
      global.vroomHandle.send({ message: register });
    },
    error: function (error) {
      Janus.error("  -- Error attaching plugin...", error);
    },
    consentDialog: function (on) {
      Janus.debug("Consent dialog should be " + (on ? "on" : "off") + " now");
    },
    mediaState: function (medium, on) {
      Janus.log(
        "Janus " + (on ? "started" : "stopped") + " receiving our " + medium,
      );
    },
    webrtcState: function (on) {
      Janus.log(
        "Janus says our WebRTC PeerConnection is " +
          (on ? "up" : "down") +
          " now",
      );
    },
    onmessage: function (msg, jsep) {
      Janus.debug(" ::: Got a message (publisher) :::");
      Janus.debug(msg);
      let event = msg["videoroom"];
      Janus.debug("Event: " + event);
      if (event != undefined && event != null) {
        if (event === "joined") {
          // Publisher/manager created, negotiate WebRTC and attach to existing feeds, if any
          global.myid = msg["id"];
          global.mypvtid = msg["private_id"];
          console.log(
            "Successfully joined room " +
              msg["room"] +
              " with ID " +
              global.myid,
          );
          global.publishOwnFeed(true);
          // Any new feed to attach to?
          if (msg["publishers"] !== undefined && msg["publishers"] !== null) {
            let list = msg["publishers"];
            console.log("Got a list of available publishers/feeds:");
            console.log(list);
            for (let f in list) {
              let id = list[f]["id"];
              let display = list[f]["display"];
              let audio = list[f]["audio_codec"];
              let video = list[f]["video_codec"];
              console.log(
                "  >> [" +
                  id +
                  "] " +
                  display +
                  " (audio: " +
                  audio +
                  ", video: " +
                  video +
                  ")",
              );
            }
          }
        } else if (event === "destroyed") {
          // The room has been destroyed
          Janus.warn("The room has been destroyed!");
          console.error("The room has been destroyed");
        } else if (event === "event") {
          // Any new feed to attach to?
          if (msg["publishers"] !== undefined && msg["publishers"] !== null) {
            console.log("new publishers!");
            let list = msg["publishers"];
            for (let f in list) {
              let id = list[f]["id"];
              let display = list[f]["display"];
              let audio = list[f]["audio_codec"];
              let video = list[f]["video_codec"];
              console.log(
                "  >> [" +
                  id +
                  "] " +
                  display +
                  " (audio: " +
                  audio +
                  ", video: " +
                  video +
                  ")",
              );
              global.newRemoteFeed(id, display, audio, video);
            }
          } else if (msg["leaving"] !== undefined && msg["leaving"] !== null) {
            // One of the publishers has gone away?
          } else if (
            msg["unpublished"] !== undefined &&
            msg["unpublished"] !== null
          ) {
            // One of the publishers has unpublished?
            if (msg["unpublished"] === "ok") {
              global.vroomHandle.hangup();
              return;
            }
          } else if (msg["error"] !== undefined && msg["error"] !== null) {
            if (msg["error_code"] === 426) {
              // This is a "no such room" error: give a more meaningful description
            } else {
              alert(msg["error"]);
            }
          }
        }
      }
      if (jsep !== undefined && jsep !== null) {
        Janus.debug("Got room event. Handling SDP as well...");
        Janus.debug(jsep);
        global.vroomHandle.handleRemoteJsep({ jsep: jsep });
        // Check if any of the media we wanted to publish has
        // been rejected (e.g., wrong or unsupported codec)
        let audio = msg["audio_codec"];
        if (
          global.mystream &&
          global.mystream.getAudioTracks() &&
          global.mystream.getAudioTracks().length > 0 &&
          !audio
        ) {
          // Audio has been rejected
          alert("Our audio stream has been rejected, viewers won't hear us");
        }
        let video = msg["video_codec"];
        if (
          global.mystream &&
          global.mystream.getVideoTracks() &&
          global.mystream.getVideoTracks().length > 0 &&
          !video
        ) {
          // Video has been rejected
          alert("Our video stream has been rejected, viewers won't see us");
          // Hide the webcam video
        }
      }
    },
    onlocalstream: function (stream) {
      console.log(" ::: Got a local stream :::", stream);
      global.mystream = stream;
      document.getElementById("localvideo").srcObject = stream;
    },
    // onremotestream: function(stream) {
    // 	// The publisher stream is sendonly, we don't expect anything here
    // },
    oncleanup: function () {
      Janus.log(" ::: Got a cleanup notification: we are unpublished now :::");
      global.mystream = null;
    },
  });
};

global.newRemoteFeed = function (id, display, audio, video) {
  let remoteFeed = null;
  global.janusRoom.attach({
    plugin: "janus.plugin.videoroom",
    opaqueId: global.opaqueId,
    success: function (pluginHandle) {
      remoteFeed = pluginHandle;
      console.log(
        "Plugin attached! (" +
          remoteFeed.getPlugin() +
          ", id=" +
          remoteFeed.getId() +
          ")",
      );
      console.log("  -- This is a subscriber");
      let subscribe = {
        request: "join",
        room: global.myRoom,
        ptype: "subscriber",
        feed: id,
        private_id: global.mypvtid,
      };
      remoteFeed.videoCodec = video;
      remoteFeed.send({ message: subscribe });
    },
    error: function (error) {
      Janus.error("  -- Error attaching plugin...", error);
    },
    onmessage: function (msg, jsep) {
      let event = msg["videoroom"];
      console.log("Event: " + event);
      if (event) {
        if (event === "attached") {
          for (let i = 1; i < 6; i++) {
            if (!global.feeds[i]) {
              global.feeds[i] = remoteFeed;
              remoteFeed.rfindex = i;
              break;
            }
          }
          remoteFeed.rfid = msg["id"];
          remoteFeed.rfdisplay = msg["display"];
        }
      }
      if (jsep) {
        remoteFeed.createAnswer({
          jsep: jsep,
          success: function (jsep) {
            let body = { request: "start", room: global.myRoom };
            remoteFeed.send({ message: body, jsep: jsep });
          },
          error: function (error) {
            console.error("WebRTC error:", error);
          },
        });
      }
    },
    iceState: function (state) {
      Janus.log(
        "ICE state of this WebRTC PeerConnection (feed #" +
          remoteFeed.rfindex +
          ") changed to " +
          state,
      );
    },
    webrtcState: function (on) {
      Janus.log(
        "Janus says this WebRTC PeerConnection (feed #" +
          remoteFeed.rfindex +
          ") is " +
          (on ? "up" : "down") +
          " now",
      );
    },
    onlocalstream: function (stream) {
      // The subscriber stream is recvonly, we don't expect anything here
    },
    onremotestream: function (stream) {
      console.log("Remote feed #", remoteFeed, ", stream:", stream);

      if (document.getElementById("remote-video-" + remoteFeed.rfid) == null) {
        let video = document.createElement("video");
        video.setAttribute("id", "remote-video-" + remoteFeed.rfid);
        video.setAttribute("playsInline", true);
        video.setAttribute("autoPlay", true);
        video.setAttribute("muted", "muted");
        video.setAttribute("width", "300px");
        video.setAttribute("height", "200px");

        video.srcObject = stream;

        document.getElementById("remote-video").appendChild(video);
      }
    },
    oncleanup: function () {
      document.getElementById();
    },
  });
};

global.publishOwnFeed = function (useAudio) {
  global.vroomHandle.createOffer({
    media: {
      audioRecv: false,
      videoRecv: false,
      audioSend: useAudio,
      videoSend: true,
    },
    success: function (jsep) {
      const publish = {
        request: "configure",
        audio: useAudio,
        video: true,
      };
      global.vroomHandle.send({ message: publish, jsep: jsep });
    },
    error: function (error) {
      Janus.error("WebRTC error:", error);
      if (useAudio) {
        global.publishOwnFeed(false);
      }
    },
  });
};

function JanusVideoRoom() {
  useEffect(() => {
    global.connect();
  }, []);

  return (
    <div id="myvideo" className="container shorter">
      <button
        onClick={() => {
          global.connect();
        }}
      >
        Add Subscriber
      </button>
      <video
        id="localvideo"
        className="rounded centered"
        width="300px"
        height="200px"
        autoPlay
        playsInline
        muted="muted"
      ></video>

      <div id="remote-video"></div>
    </div>
  );
}

export default JanusVideoRoom;
