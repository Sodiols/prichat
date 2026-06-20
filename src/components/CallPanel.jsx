"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import UserAvatar from "./UserAvatar";

const RTC_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function getPairId(a, b) {
  return [a, b].sort().join("_");
}

function toPlainDescription(description) {
  return description ? { type: description.type, sdp: description.sdp } : null;
}

export default function CallPanel({ roomId, room, user, isAdmin, isSystemAdmin }) {
  const [activeCall, setActiveCall] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [joined, setJoined] = useState(false);
  const [hiddenJoin, setHiddenJoin] = useState(false);
  const [joining, setJoining] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState("");
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const activeCallRef = useRef(null);
  const joinedRef = useRef(false);
  const hiddenJoinRef = useRef(false);
  const peerConnectionsRef = useRef(new Map());
  const peerUnsubsRef = useRef(new Map());
  const processedCandidatesRef = useRef(new Map());
  const remoteDescriptionSetRef = useRef(new Set());
  const answeredPairsRef = useRef(new Set());

  const visibleParticipants = useMemo(
    () => participants.filter((p) => !p.hidden && !p.leftAt),
    [participants]
  );

  const joinedParticipant = participants.find((p) => p.uid === user.uid && !p.leftAt);
  const isCallCreator = activeCall?.createdBy === user.uid;
  const canEndForEveryone = !!activeCall && (isCallCreator || isAdmin || isSystemAdmin);

  useEffect(() => {
    const q = query(collection(db, "rooms", roomId, "calls"), where("status", "==", "active"));
    const unsub = onSnapshot(q, (snap) => {
      const calls = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      calls.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      const nextCall = calls[0] || null;
      activeCallRef.current = nextCall;
      setActiveCall(nextCall);
      if (!nextCall) {
        setPanelOpen(false);
        setParticipants([]);
      }
    });
    return () => unsub();
  }, [roomId]);

  useEffect(() => {
    if (!activeCall) {
      if (joinedRef.current) leaveCurrentCall({ markLeft: false });
      setJoined(false);
      joinedRef.current = false;
      return undefined;
    }

    const unsub = onSnapshot(collection(db, "rooms", roomId, "calls", activeCall.id, "participants"), (snap) => {
      setParticipants(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, activeCall?.id]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const cleanupPeers = useCallback(() => {
    peerUnsubsRef.current.forEach((unsubs) => unsubs.forEach((unsub) => unsub?.()));
    peerUnsubsRef.current.clear();
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    processedCandidatesRef.current.clear();
    remoteDescriptionSetRef.current.clear();
    answeredPairsRef.current.clear();
    setRemoteStreams({});
  }, []);

  const stopLocalMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    screenStreamRef.current = null;
    setLocalStream(null);
    setScreenSharing(false);
  }, []);

  const leaveCurrentCall = useCallback(
    async ({ markLeft = true } = {}) => {
      const call = activeCallRef.current;
      const wasJoined = joinedRef.current;
      cleanupPeers();
      stopLocalMedia();
      setJoined(false);
      joinedRef.current = false;
      setHiddenJoin(false);
      hiddenJoinRef.current = false;
      setPanelOpen(false);
      setMuted(false);
      setCameraOff(false);
      setScreenSharing(false);
      setError("");

      if (markLeft && call && wasJoined) {
        await setDoc(
          doc(db, "rooms", roomId, "calls", call.id, "participants", user.uid),
          { leftAt: serverTimestamp(), updatedAt: serverTimestamp() },
          { merge: true }
        ).catch(() => {});
      }
    },
    [cleanupPeers, roomId, stopLocalMedia, user.uid]
  );

  useEffect(() => {
    return () => {
      cleanupPeers();
      stopLocalMedia();
    };
  }, [cleanupPeers, stopLocalMedia]);

  const createPeerConnection = useCallback(
    async (remoteParticipant) => {
      const call = activeCallRef.current;
      if (!call || !joinedRef.current || remoteParticipant.uid === user.uid) return;
      if (peerConnectionsRef.current.has(remoteParticipant.uid)) return;

      const pairId = getPairId(user.uid, remoteParticipant.uid);
      const isOfferer = user.uid < remoteParticipant.uid;
      const pc = new RTCPeerConnection(RTC_SERVERS);
      peerConnectionsRef.current.set(remoteParticipant.uid, pc);

      const localTracks = localStreamRef.current?.getTracks() || [];
      const hasLocalVideo = localTracks.some((track) => track.kind === "video");
      const hasLocalAudio = localTracks.some((track) => track.kind === "audio");

      localTracks.forEach((track) => pc.addTrack(track, localStreamRef.current));
      if (!hasLocalAudio) pc.addTransceiver("audio", { direction: hiddenJoinRef.current ? "recvonly" : "sendrecv" });
      if (!hasLocalVideo) pc.addTransceiver("video", { direction: hiddenJoinRef.current ? "recvonly" : "sendrecv" });

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        setRemoteStreams((current) => ({ ...current, [remoteParticipant.uid]: stream }));
      };

      pc.onconnectionstatechange = () => {
        if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
          setRemoteStreams((current) => {
            const next = { ...current };
            delete next[remoteParticipant.uid];
            return next;
          });
        }
      };

      const peerDoc = doc(db, "rooms", roomId, "calls", call.id, "peers", pairId);
      const localCandidates = collection(peerDoc, isOfferer ? "offerCandidates" : "answerCandidates");
      const remoteCandidates = collection(peerDoc, isOfferer ? "answerCandidates" : "offerCandidates");

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(localCandidates, event.candidate.toJSON()).catch(() => {});
        }
      };

      const candidateUnsub = onSnapshot(remoteCandidates, (snap) => {
        const seen = processedCandidatesRef.current.get(pairId) || new Set();
        snap.docChanges().forEach((change) => {
          if (change.type !== "added" || seen.has(change.doc.id)) return;
          seen.add(change.doc.id);
          pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
        });
        processedCandidatesRef.current.set(pairId, seen);
      });

      const peerUnsub = onSnapshot(peerDoc, async (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();

        if (isOfferer && data.answer && !remoteDescriptionSetRef.current.has(pairId)) {
          remoteDescriptionSetRef.current.add(pairId);
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer)).catch(() => {});
        }

        if (!isOfferer && data.offer && !answeredPairsRef.current.has(pairId)) {
          answeredPairsRef.current.add(pairId);
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer)).catch(() => {});
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await setDoc(
            peerDoc,
            {
              answer: toPlainDescription(answer),
              answererUid: user.uid,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      });

      peerUnsubsRef.current.set(remoteParticipant.uid, [candidateUnsub, peerUnsub]);

      if (isOfferer) {
        const existing = await getDoc(peerDoc);
        if (!existing.exists() || !existing.data()?.offer) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await setDoc(
            peerDoc,
            {
              offer: toPlainDescription(offer),
              offererUid: user.uid,
              answererUid: remoteParticipant.uid,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      }
    },
    [roomId, user.uid]
  );

  useEffect(() => {
    if (!activeCall || !joined) return;

    const liveRemotes = participants.filter((p) => p.uid !== user.uid && !p.leftAt);
    liveRemotes.forEach((participant) => createPeerConnection(participant));

    const liveIds = new Set(liveRemotes.map((p) => p.uid));
    peerConnectionsRef.current.forEach((pc, uid) => {
      if (liveIds.has(uid)) return;
      pc.close();
      peerConnectionsRef.current.delete(uid);
      peerUnsubsRef.current.get(uid)?.forEach((unsub) => unsub?.());
      peerUnsubsRef.current.delete(uid);
      setRemoteStreams((current) => {
        const next = { ...current };
        delete next[uid];
        return next;
      });
    });
  }, [activeCall, createPeerConnection, joined, participants, user.uid]);

  const joinCall = async (call, mode = "normal") => {
    if (!call || joining) return;
    setJoining(true);
    setError("");
    const hidden = mode === "hidden" && isSystemAdmin;
    setHiddenJoin(hidden);
    hiddenJoinRef.current = hidden;

    try {
      let mediaStream = null;
      if (!hidden) {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: call.type === "video",
        });
        localStreamRef.current = mediaStream;
        setLocalStream(mediaStream);
        setMuted(false);
        setCameraOff(call.type !== "video");
      }

      await setDoc(
        doc(db, "rooms", roomId, "calls", call.id, "participants", user.uid),
        {
          uid: user.uid,
          displayName: user.displayName || user.email,
          photoURL: user.photoURL || null,
          hidden,
          role: hidden ? "admin" : "normal",
          muted: hidden ? true : false,
          cameraOff: hidden ? true : call.type !== "video",
          screenSharing: false,
          joinedAt: serverTimestamp(),
          leftAt: null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      joinedRef.current = true;
      setJoined(true);
      setPanelOpen(true);
      setSpeakerOn(true);
    } catch (err) {
      stopLocalMedia();
      setError("Couldn't join the call. Allow microphone and camera permission, then try again.");
    } finally {
      setJoining(false);
    }
  };

  const startCall = async (type) => {
    if (activeCall || joining) return;
    setJoining(true);
    setError("");
    try {
      const callRef = await addDoc(collection(db, "rooms", roomId, "calls"), {
        roomId,
        roomName: room?.name || "Room",
        type,
        status: "active",
        createdBy: user.uid,
        createdByName: user.displayName || user.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const call = {
        id: callRef.id,
        roomId,
        type,
        status: "active",
        createdBy: user.uid,
        createdByName: user.displayName || user.email,
      };
      activeCallRef.current = call;
      setActiveCall(call);
      await joinCall(call, "normal");
    } catch {
      setError("Couldn't start the call. Check Firestore rules and browser permissions.");
    } finally {
      setJoining(false);
    }
  };

  const toggleMute = async () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    if (activeCall) {
      await setDoc(
        doc(db, "rooms", roomId, "calls", activeCall.id, "participants", user.uid),
        { muted: nextMuted, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(() => {});
    }
  };

  const toggleCamera = async () => {
    const nextCameraOff = !cameraOff;
    setCameraOff(nextCameraOff);
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !nextCameraOff;
    });
    if (activeCall) {
      await setDoc(
        doc(db, "rooms", roomId, "calls", activeCall.id, "participants", user.uid),
        { cameraOff: nextCameraOff, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(() => {});
    }
  };

  const replaceVideoTrack = async (track) => {
    const promises = [];
    peerConnectionsRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video" || s.track === null);
      if (sender) promises.push(sender.replaceTrack(track));
    });
    await Promise.allSettled(promises);
  };

  const stopScreenShare = async () => {
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null;
    await replaceVideoTrack(cameraTrack);
    setScreenSharing(false);
    if (activeCall) {
      await setDoc(
        doc(db, "rooms", roomId, "calls", activeCall.id, "participants", user.uid),
        { screenSharing: false, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(() => {});
    }
  };

  const startScreenShare = async () => {
    if (screenSharing) {
      await stopScreenShare();
      return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = screenStream.getVideoTracks()[0];
      screenStreamRef.current = screenStream;
      await replaceVideoTrack(screenTrack);
      setScreenSharing(true);
      screenTrack.onended = () => stopScreenShare();
      if (activeCall) {
        await setDoc(
          doc(db, "rooms", roomId, "calls", activeCall.id, "participants", user.uid),
          { screenSharing: true, updatedAt: serverTimestamp() },
          { merge: true }
        ).catch(() => {});
      }
    } catch {
      setError("Screen sharing was cancelled or blocked by the browser.");
    }
  };

  const endForEveryone = async () => {
    if (!activeCall || !canEndForEveryone) return;
    await updateDoc(doc(db, "rooms", roomId, "calls", activeCall.id), {
      status: "ended",
      endedBy: user.uid,
      endedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch(() => {});
    await leaveCurrentCall({ markLeft: true });
  };

  if (!user) return null;

  return (
    <div className="border-b border-border bg-bg/80 px-3 sm:px-6 py-2 shrink-0">
      <div className="flex flex-wrap items-center gap-2">
        {!activeCall && (
          <>
            <button
              id="call-audio-button"
              type="button"
              onClick={() => startCall("audio")}
              disabled={joining}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-textPrimary hover:border-accent/50 hover:bg-surfaceHover disabled:opacity-50"
            >
              🎙️ Voice call
            </button>
            <button
              id="call-video-button"
              type="button"
              onClick={() => startCall("video")}
              disabled={joining}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-textPrimary hover:border-accent/50 hover:bg-surfaceHover disabled:opacity-50"
            >
              📹 Video call
            </button>
          </>
        )}

        {activeCall && !joined && (
          <>
            <span className="rounded-lg bg-accentMuted px-3 py-1.5 text-xs text-accent">
              {activeCall.type === "video" ? "Video" : "Voice"} call is active
            </span>
            <button
              type="button"
              onClick={() => joinCall(activeCall, "normal")}
              disabled={joining}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg disabled:opacity-50"
            >
              {joining ? "Joining…" : "Join call"}
            </button>
            {isSystemAdmin && (
              <button
                type="button"
                onClick={() => joinCall(activeCall, "hidden")}
                disabled={joining}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-textSecondary hover:text-textPrimary disabled:opacity-50"
              >
                Join as admin
              </button>
            )}
          </>
        )}

        {activeCall && joined && (
          <button
            type="button"
            onClick={() => setPanelOpen((open) => !open)}
            className="rounded-lg bg-accentMuted px-3 py-1.5 text-xs text-accent"
          >
            {panelOpen ? "Hide call" : "Open call"} · {activeCall.type === "video" ? "Video" : "Voice"}
          </button>
        )}

        {visibleParticipants.length > 0 && (
          <span className="text-xs text-textSecondary">
            {visibleParticipants.length} in call
          </span>
        )}

        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {activeCall && joined && panelOpen && (
        <div className="mt-3 rounded-2xl border border-border bg-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="font-display text-sm font-semibold">
                {activeCall.type === "video" ? "Video call" : "Voice call"}
              </h3>
              <p className="text-xs text-textSecondary">
                {hiddenJoin ? "Joined as hidden admin" : `Room: ${room?.name || "PriChat"}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!hiddenJoin && (
                <button onClick={toggleMute} className="call-control-button">
                  {muted ? "Unmute" : "Mute"}
                </button>
              )}
              {!hiddenJoin && activeCall.type === "video" && (
                <button onClick={toggleCamera} className="call-control-button">
                  {cameraOff ? "Camera on" : "Camera off"}
                </button>
              )}
              {!hiddenJoin && (
                <button onClick={startScreenShare} className="call-control-button">
                  {screenSharing ? "Stop share" : "Share screen"}
                </button>
              )}
              {activeCall.type === "audio" && (
                <button onClick={() => setSpeakerOn((value) => !value)} className="call-control-button">
                  {speakerOn ? "Speaker off" : "Speaker on"}
                </button>
              )}
              <button onClick={() => leaveCurrentCall({ markLeft: true })} className="call-danger-button">
                Cut call
              </button>
              {canEndForEveryone && (
                <button onClick={endForEveryone} className="call-danger-button">
                  End for all
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {!hiddenJoin && (
              <div className="relative min-h-40 overflow-hidden rounded-xl border border-border bg-bg">
                {localStream && activeCall.type === "video" && !cameraOff ? (
                  <video ref={localVideoRef} autoPlay playsInline muted className="h-full min-h-40 w-full object-cover" />
                ) : (
                  <ParticipantPlaceholder participant={joinedParticipant || { displayName: user.displayName, photoURL: user.photoURL }} label="You" />
                )}
                <TileLabel
                  name={`${user.displayName || user.email} (you)`}
                  muted={muted}
                  cameraOff={cameraOff}
                  screenSharing={screenSharing}
                />
              </div>
            )}

            {visibleParticipants
              .filter((p) => p.uid !== user.uid)
              .map((participant) => (
                <RemoteMediaTile
                  key={participant.uid}
                  participant={participant}
                  stream={remoteStreams[participant.uid]}
                  type={activeCall.type}
                  speakerOn={speakerOn}
                />
              ))}
          </div>

          <div className="mt-3 rounded-xl border border-border bg-bg/60 p-3">
            <p className="mb-2 text-xs uppercase tracking-wider text-textSecondary">People in call</p>
            <div className="flex flex-wrap gap-2">
              {visibleParticipants.length === 0 && <span className="text-sm text-textSecondary">No visible participants.</span>}
              {visibleParticipants.map((participant) => (
                <div key={participant.uid} className="flex items-center gap-2 rounded-full border border-border bg-surface px-2 py-1">
                  <UserAvatar name={participant.displayName} photoURL={participant.photoURL} size="sm" />
                  <span className="text-xs">
                    {participant.displayName || "Member"}{participant.uid === user.uid ? " (you)" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RemoteMediaTile({ participant, stream, type, speakerOn }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const showVideo = type === "video" && stream && !participant.cameraOff;

  return (
    <div className="relative min-h-40 overflow-hidden rounded-xl border border-border bg-bg">
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={!speakerOn}
          className="h-full min-h-40 w-full object-cover"
        />
      ) : stream ? (
        <>
          <audio ref={videoRef} autoPlay muted={!speakerOn} />
          <ParticipantPlaceholder participant={participant} />
        </>
      ) : (
        <ParticipantPlaceholder participant={participant} />
      )}
      <TileLabel
        name={participant.displayName || "Member"}
        muted={participant.muted}
        cameraOff={participant.cameraOff}
        screenSharing={participant.screenSharing}
      />
    </div>
  );
}

function ParticipantPlaceholder({ participant, label }) {
  return (
    <div className="flex min-h-40 h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
      <UserAvatar name={participant?.displayName || label} photoURL={participant?.photoURL} size="lg" />
      <span className="text-sm text-textSecondary">{label || participant?.displayName || "Member"}</span>
    </div>
  );
}

function TileLabel({ name, muted, cameraOff, screenSharing }) {
  return (
    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 rounded-lg bg-black/55 px-2 py-1 backdrop-blur">
      <span className="truncate text-xs text-white">{name}</span>
      <span className="flex gap-1 text-[11px] text-white/80">
        {muted && <span>Muted</span>}
        {cameraOff && <span>Camera off</span>}
        {screenSharing && <span>Sharing</span>}
      </span>
    </div>
  );
}
