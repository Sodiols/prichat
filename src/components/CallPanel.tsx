"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { mapCall, mapParticipant } from "@/lib/mappers";
import UserAvatar from "./UserAvatar";

const RTC_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
  sdpSemantics: "unified-plan",
};

function getPairId(a, b) {
  return [a, b].sort().join("_");
}

function toPlainDescription(description) {
  return description ? { type: description.type, sdp: description.sdp } : null;
}

export default function CallPanel({ roomId, room, user, isAdmin, isSystemAdmin }) {
  const [activeCall, setActiveCall] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [joined, setJoined] = useState(false);
  const [hiddenJoin, setHiddenJoin] = useState(false);
  const [joining, setJoining] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const activeCallRef = useRef<any>(null);
  const joinedRef = useRef(false);
  const hiddenJoinRef = useRef(false);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerUnsubsRef = useRef<Map<string, Array<() => void>>>(new Map());
  const processedCandidatesRef = useRef<Map<string, Set<string>>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidate[]>>(new Map());
  const remoteDescriptionSetRef = useRef<Set<string>>(new Set());
  const answeredPairsRef = useRef<Set<string>>(new Set());
  const userId = user?.uid || "";
  const userName = user?.displayName || user?.email || "Member";
  const userPhotoURL = user?.photoURL || null;

  const visibleParticipants = useMemo(
    () => participants.filter((p) => !p.hidden && !p.leftAt),
    [participants]
  );
  const remoteParticipants = useMemo(
    () => visibleParticipants.filter((p) => p.uid !== userId),
    [visibleParticipants, userId]
  );

  const joinedParticipant = participants.find((p) => p.uid === userId && !p.leftAt);
  const isCallCreator = activeCall?.createdBy === userId;
  const canEndForEveryone = !!activeCall && (isCallCreator || isAdmin || isSystemAdmin);

  useEffect(() => {
    let active = true;

    const loadActiveCall = async () => {
      const { data, error: loadError } = await supabase
        .from("calls")
        .select("*")
        .eq("room_id", roomId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);
      if (!active) return;
      if (loadError) {
        setError("Couldn't load room calls. Please try again.");
        return;
      }
      const nextCall = data && data[0] ? mapCall(data[0]) : null;
      activeCallRef.current = nextCall;
      setActiveCall(nextCall);
      if (!nextCall) {
        setPanelOpen(false);
        setParticipants([]);
      }
    };

    loadActiveCall();

    const channel = supabase
      .channel(`calls:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls", filter: `room_id=eq.${roomId}` },
        () => loadActiveCall()
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    if (!activeCall) {
      if (joinedRef.current) leaveCurrentCall({ markLeft: false });
      setJoined(false);
      joinedRef.current = false;
      return undefined;
    }

    let active = true;

    const loadParticipants = async () => {
      const { data, error: loadError } = await supabase
        .from("call_participants")
        .select("*")
        .eq("call_id", activeCall.id);
      if (!active) return;
      if (loadError) {
        setError("Couldn't load call participants. Please try again.");
        return;
      }
      setParticipants((data || []).map(mapParticipant));
    };

    loadParticipants();

    const channel = supabase
      .channel(`participants:${activeCall.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "call_participants",
          filter: `call_id=eq.${activeCall.id}`,
        },
        () => loadParticipants()
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
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
    pendingCandidatesRef.current.clear();
    remoteDescriptionSetRef.current.clear();
    answeredPairsRef.current.clear();
    setRemoteStreams({});
  }, []);

  const addOrQueueRemoteCandidate = useCallback(async (pairId, pc, candidateData) => {
    const candidate = new RTCIceCandidate(candidateData);
    if (!pc.remoteDescription) {
      const pending = pendingCandidatesRef.current.get(pairId) || [];
      pending.push(candidate);
      pendingCandidatesRef.current.set(pairId, pending);
      return;
    }
    await pc.addIceCandidate(candidate).catch(() => {});
  }, []);

  const flushPendingCandidates = useCallback(async (pairId, pc) => {
    if (!pc.remoteDescription) return;
    const pending = pendingCandidatesRef.current.get(pairId) || [];
    pendingCandidatesRef.current.delete(pairId);
    for (const candidate of pending) {
      await pc.addIceCandidate(candidate).catch(() => {});
    }
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
        await supabase
          .from("call_participants")
          .update({ left_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("call_id", call.id)
          .eq("uid", userId)
          .then(() => {});
      }
    },
    [cleanupPeers, stopLocalMedia, userId]
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
      if (!call || !joinedRef.current || remoteParticipant.uid === userId) return;
      if (peerConnectionsRef.current.has(remoteParticipant.uid)) return;

      const pairId = getPairId(userId, remoteParticipant.uid);
      const isOfferer = userId < remoteParticipant.uid;
      const pc = new RTCPeerConnection(RTC_SERVERS);
      peerConnectionsRef.current.set(remoteParticipant.uid, pc);

      const localTracks = localStreamRef.current?.getTracks() || [];
      const hasLocalVideo = localTracks.some((track) => track.kind === "video");
      const hasLocalAudio = localTracks.some((track) => track.kind === "audio");

      localTracks.forEach((track) => pc.addTrack(track, localStreamRef.current));
      if (!hasLocalAudio) {
        pc.addTransceiver("audio", { direction: hiddenJoinRef.current ? "recvonly" : "sendrecv" });
      }
      if (!hasLocalVideo) {
        pc.addTransceiver("video", { direction: hiddenJoinRef.current ? "recvonly" : "sendrecv" });
      }

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        setRemoteStreams((current) => ({
          ...current,
          [remoteParticipant.uid]: stream,
        }));
      };

      pc.oniceconnectionstatechange = () => {
        if (["failed", "closed", "disconnected"].includes(pc.iceConnectionState)) {
          setRemoteStreams((current) => {
            const next = { ...current };
            delete next[remoteParticipant.uid];
            return next;
          });
        }
      };

      const localKind = isOfferer ? "offer" : "answer";
      const remoteKind = isOfferer ? "answer" : "offer";

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          supabase
            .from("call_ice_candidates")
            .insert({
              call_id: call.id,
              pair_id: pairId,
              kind: localKind,
              candidate: event.candidate.toJSON(),
            })
            .then(() => {});
        }
      };

      const handleRemoteCandidate = (row) => {
        if (!row || row.call_id !== call.id || row.kind !== remoteKind) return;
        const seen = processedCandidatesRef.current.get(pairId) || new Set();
        if (seen.has(row.id)) return;
        seen.add(row.id);
        processedCandidatesRef.current.set(pairId, seen);
        addOrQueueRemoteCandidate(pairId, pc, row.candidate).catch(() => {});
      };

      const handlePeerRow = async (data) => {
        if (!data || data.call_id !== call.id) return;

        if (isOfferer && data.answer && !remoteDescriptionSetRef.current.has(pairId)) {
          remoteDescriptionSetRef.current.add(pairId);
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            await flushPendingCandidates(pairId, pc);
          } catch {
            remoteDescriptionSetRef.current.delete(pairId);
          }
        }

        if (!isOfferer && data.offer && !answeredPairsRef.current.has(pairId)) {
          answeredPairsRef.current.add(pairId);
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            await flushPendingCandidates(pairId, pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await supabase
              .from("call_peers")
              .update({
                answer: toPlainDescription(answer),
                answerer_uid: userId,
                updated_at: new Date().toISOString(),
              })
              .eq("call_id", call.id)
              .eq("pair_id", pairId)
              .then(() => {});
          } catch {
            answeredPairsRef.current.delete(pairId);
          }
        }
      };

      const channel = supabase
        .channel(`peer:${call.id}:${pairId}:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "call_ice_candidates",
            filter: `pair_id=eq.${pairId}`,
          },
          (payload) => handleRemoteCandidate(payload.new)
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "call_peers",
            filter: `pair_id=eq.${pairId}`,
          },
          (payload) => {
            if (payload.eventType !== "DELETE") handlePeerRow(payload.new);
          }
        )
        .subscribe();

      peerUnsubsRef.current.set(remoteParticipant.uid, [
        () => supabase.removeChannel(channel),
      ]);

      // Catch up on any signaling that already landed before the subscription.
      const { data: existingPeer } = await supabase
        .from("call_peers")
        .select("*")
        .eq("call_id", call.id)
        .eq("pair_id", pairId)
        .maybeSingle();

      const { data: existingCandidates } = await supabase
        .from("call_ice_candidates")
        .select("*")
        .eq("call_id", call.id)
        .eq("pair_id", pairId)
        .eq("kind", remoteKind);
      (existingCandidates || []).forEach(handleRemoteCandidate);

      if (isOfferer) {
        if (!existingPeer || !existingPeer.offer) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await supabase
            .from("call_peers")
            .upsert(
              {
                call_id: call.id,
                pair_id: pairId,
                offer: toPlainDescription(offer),
                offerer_uid: userId,
                answerer_uid: remoteParticipant.uid,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "call_id,pair_id" }
            )
            .then(() => {});
        }
      } else if (existingPeer) {
        // Offer may already be present; process it right away.
        handlePeerRow(existingPeer);
      }
    },
    [addOrQueueRemoteCandidate, flushPendingCandidates, userId]
  );

  useEffect(() => {
    if (!activeCall || !joined) return;

    const liveRemotes = participants.filter((p) => p.uid !== userId && !p.leftAt);
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
  }, [activeCall, createPeerConnection, joined, participants, userId]);

  const joinCall = async (call: any, mode = "normal", options: { ignoreJoining?: boolean } = {}) => {
    if (!call || (joining && !options.ignoreJoining)) return;
    if (typeof window === "undefined" || !window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support audio/video calls.");
      return;
    }

    setJoining(true);
    setError("");
    const hidden = mode === "hidden" && isSystemAdmin;
    setHiddenJoin(hidden);
    hiddenJoinRef.current = hidden;

    try {
      let mediaStream = null;
      if (!hidden) {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: call.type === "video"
            ? {
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : false,
        });
        localStreamRef.current = mediaStream;
        setLocalStream(mediaStream);
        setMuted(false);
        setCameraOff(call.type !== "video");
      }

      await supabase.from("call_participants").upsert(
        {
          call_id: call.id,
          uid: userId,
          display_name: userName,
          photo_url: userPhotoURL,
          hidden,
          role: hidden ? "admin" : "normal",
          muted: hidden ? true : false,
          camera_off: hidden ? true : call.type !== "video",
          screen_sharing: false,
          joined_at: new Date().toISOString(),
          left_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "call_id,uid" }
      );

      joinedRef.current = true;
      setJoined(true);
      setPanelOpen(true);
      setSpeakerOn(true);
    } catch (err) {
      stopLocalMedia();
      setError(
        err?.name === "NotAllowedError"
          ? "Microphone/camera access was blocked. Please allow permissions and try again."
          : "Couldn't join the call. Please allow media permissions and try again."
      );
    } finally {
      setJoining(false);
    }
  };

  const startCall = async (type) => {
    if (activeCall || joining) return;
    setJoining(true);
    setError("");
    try {
      const { data, error: insertError } = await supabase
        .from("calls")
        .insert({
          room_id: roomId,
          room_name: room?.name || "Room",
          type,
          status: "active",
          created_by: userId,
          created_by_name: userName,
        })
        .select()
        .single();
      if (insertError) throw insertError;

      const call = mapCall(data);
      activeCallRef.current = call;
      setActiveCall(call);
      await joinCall(call, "normal", { ignoreJoining: true });
    } catch {
      setError("Couldn't start the call. Please check your browser permissions and try again.");
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
      await supabase
        .from("call_participants")
        .update({ muted: nextMuted, updated_at: new Date().toISOString() })
        .eq("call_id", activeCall.id)
        .eq("uid", userId)
        .then(() => {});
    }
  };

  const toggleCamera = async () => {
    const nextCameraOff = !cameraOff;
    setCameraOff(nextCameraOff);
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !nextCameraOff;
    });
    if (activeCall) {
      await supabase
        .from("call_participants")
        .update({ camera_off: nextCameraOff, updated_at: new Date().toISOString() })
        .eq("call_id", activeCall.id)
        .eq("uid", userId)
        .then(() => {});
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
      await supabase
        .from("call_participants")
        .update({ screen_sharing: false, updated_at: new Date().toISOString() })
        .eq("call_id", activeCall.id)
        .eq("uid", userId)
        .then(() => {});
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
        await supabase
          .from("call_participants")
          .update({ screen_sharing: true, updated_at: new Date().toISOString() })
          .eq("call_id", activeCall.id)
          .eq("uid", userId)
          .then(() => {});
      }
    } catch {
      setError("Screen sharing was cancelled or blocked by the browser.");
    }
  };

  const endForEveryone = async () => {
    if (!activeCall || !canEndForEveryone) return;
    await supabase
      .from("calls")
      .update({
        status: "ended",
        ended_by: userId,
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", activeCall.id)
      .then(() => {});
    await leaveCurrentCall({ markLeft: true });
  };

  if (!user) return null;
  const callLabel = activeCall?.type === "video" ? "Video" : "Audio";

  return (
    <div className="shrink-0 border-b border-border bg-bg/90 px-3 py-3 sm:px-6">
      <div className="flex flex-col gap-3">
        {!activeCall && (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold text-textPrimary">Start a website call</p>
              <p className="text-xs text-textSecondary">Use audio or video with everyone in this room.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              id="call-audio-button"
              type="button"
              onClick={() => startCall("audio")}
              disabled={joining}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-xs font-medium text-textPrimary transition hover:border-accent/50 hover:bg-surfaceHover disabled:opacity-50"
            >
                <PhoneIcon />
                Audio call
            </button>
            <button
              id="call-video-button"
              type="button"
              onClick={() => startCall("video")}
              disabled={joining}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
            >
                <VideoIcon />
                Video call
            </button>
            </div>
          </div>
        )}

        {activeCall && !joined && (
          <div className="flex flex-col gap-3 rounded-2xl border border-accent/35 bg-accentMuted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold text-textPrimary">{callLabel} call is active</p>
              <p className="text-xs text-textSecondary">
                Join with {activeCall.type === "video" ? "camera and microphone" : "microphone"} to talk in this room.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => joinCall(activeCall, "normal")}
              disabled={joining}
                className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
            >
              {joining ? "Joining…" : "Join call"}
            </button>
            {isSystemAdmin && (
              <button
                type="button"
                onClick={() => joinCall(activeCall, "hidden")}
                disabled={joining}
                  className="rounded-xl border border-border bg-surface px-4 py-2 text-xs text-textSecondary transition hover:text-textPrimary disabled:opacity-50"
              >
                Join as admin
              </button>
            )}
            </div>
          </div>
        )}

        {activeCall && joined && (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accentMuted text-accent">
                {activeCall.type === "video" ? <VideoIcon /> : <PhoneIcon />}
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold text-textPrimary">{callLabel} call in progress</p>
                <p className="truncate text-xs text-textSecondary">
                  {visibleParticipants.length || 1} in call · {hiddenJoin ? "Hidden admin mode" : room?.name || "PriChat"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPanelOpen((open) => !open)}
                className="rounded-xl border border-border bg-bg px-4 py-2 text-xs font-medium text-textPrimary transition hover:border-accent/50 hover:bg-surfaceHover"
              >
                {panelOpen ? "Hide call screen" : "Open call screen"}
              </button>
              <button
                type="button"
                onClick={() => leaveCurrentCall({ markLeft: true })}
                className="rounded-xl bg-red-500/90 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-500"
              >
                Leave call
              </button>
            </div>
          </div>
        )}

        {error && <p className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
      </div>

      {activeCall && joined && panelOpen && (
        <div className="mt-3 rounded-2xl border border-border bg-surface p-3 shadow-2xl shadow-black/20">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold">
                {callLabel} call
              </h3>
              <p className="text-xs text-textSecondary">
                {hiddenJoin ? "Joined as hidden admin" : `Room: ${room?.name || "PriChat"}`} · {visibleParticipants.length || 1} participant{(visibleParticipants.length || 1) === 1 ? "" : "s"}
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
                Leave
              </button>
              {canEndForEveryone && (
                <button onClick={endForEveryone} className="call-danger-button">
                  End for all
                </button>
              )}
            </div>
          </div>

          <div className={`grid gap-2 ${activeCall.type === "video" ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
            {!hiddenJoin && (
              <div className={`relative overflow-hidden rounded-xl border border-border bg-bg ${activeCall.type === "video" ? "min-h-56" : "min-h-40"}`}>
                {localStream && activeCall.type === "video" && !cameraOff ? (
                  <video ref={localVideoRef} autoPlay playsInline muted className="h-full min-h-56 w-full object-cover" />
                ) : (
                  <ParticipantPlaceholder participant={joinedParticipant || { displayName: userName, photoURL: userPhotoURL }} label="You" />
                )}
                <TileLabel
                  name={`${userName} (you)`}
                  muted={muted}
                  cameraOff={cameraOff}
                  screenSharing={screenSharing}
                />
              </div>
            )}

            {remoteParticipants.map((participant) => (
              <RemoteMediaTile
                key={participant.uid}
                participant={participant}
                stream={remoteStreams[participant.uid]}
                type={activeCall.type}
                speakerOn={speakerOn}
              />
            ))}

            {remoteParticipants.length === 0 && (
              <div className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg/60 p-6 text-center ${activeCall.type === "video" ? "min-h-56" : "min-h-40"}`}>
                <span className="mb-2 text-sm font-medium text-textPrimary">Waiting for others</span>
                <span className="max-w-xs text-xs text-textSecondary">When someone joins this room call, their audio or video will appear here.</span>
              </div>
            )}
          </div>

          <div className="mt-3 rounded-xl border border-border bg-bg/60 p-3">
            <p className="mb-2 text-xs uppercase tracking-wider text-textSecondary">People in call</p>
            <div className="flex flex-wrap gap-2">
              {visibleParticipants.length === 0 && <span className="text-sm text-textSecondary">No visible participants.</span>}
              {visibleParticipants.map((participant) => (
                <div key={participant.uid} className="flex items-center gap-2 rounded-full border border-border bg-surface px-2 py-1">
                  <UserAvatar name={participant.displayName} photoURL={participant.photoURL} size="sm" />
                  <span className="text-xs">
                    {participant.displayName || "Member"}{participant.uid === userId ? " (you)" : ""}
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

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5.7 4.5 8 4c.7-.1 1.4.2 1.7.9l1 2.3c.3.6.1 1.3-.4 1.8l-1.1 1c.8 1.6 2.1 3 3.7 3.8l1.1-1.1c.5-.5 1.2-.6 1.8-.4l2.3 1c.7.3 1 1 .9 1.7l-.4 2.3c-.1.8-.8 1.3-1.6 1.3C9.9 18.5 4.5 13.1 4.5 6c0-.8.5-1.5 1.2-1.6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7.5C4 6.1 5.1 5 6.5 5h6C13.9 5 15 6.1 15 7.5v9c0 1.4-1.1 2.5-2.5 2.5h-6C5.1 19 4 17.9 4 16.5v-9Z" stroke="currentColor" strokeWidth="2" />
      <path d="m15 10 4-2.3c.7-.4 1.5.1 1.5.9v6.8c0 .8-.8 1.3-1.5.9L15 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RemoteMediaTile({ participant, stream, type, speakerOn }: any) {
  const videoRef = useRef<any>(null);

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

function ParticipantPlaceholder({ participant, label }: any) {
  return (
    <div className="flex min-h-40 h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
      <UserAvatar name={participant?.displayName || label} photoURL={participant?.photoURL} size="lg" />
      <span className="text-sm text-textSecondary">{label || participant?.displayName || "Member"}</span>
    </div>
  );
}

function TileLabel({ name, muted, cameraOff, screenSharing }: any) {
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
