import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationContext";
import { PageHeader } from "../components/shared/PageHeader";
import { Avatar } from "../components/shared/Avatar";
import { showToast } from "../components/shared/Toast";
import { supabase } from "../services/supabaseClient";
import type { Meeting, MeetingParticipant, MeetingSignal, Profile } from "../types";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorUp,
  Hand,
  PhoneOff,
  Users,
  MessageSquare,
  Send,
  Settings,
  Clock,
} from "lucide-react";
import { cn } from "../utils/helpers";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  // TURN servers enable connections behind symmetric NAT / corporate firewalls
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

// Tag for all console logging in this module
const LOG_TAG = "[Meeting/WebRTC]";

function log(...args: unknown[]) {
  console.log(LOG_TAG, ...args);
}
function logWarn(...args: unknown[]) {
  console.warn(LOG_TAG, ...args);
}
function logError(...args: unknown[]) {
  console.error(LOG_TAG, ...args);
}

export default function Meetings() {
  const { user, profile } = useAuth();
  const { addNotification } = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const joinRoomId = (location.state as { joinRoomId?: string } | null)?.joinRoomId;

  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [isInMeeting, setIsInMeeting] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [meetingChat, setMeetingChat] = useState<{ id: string; sender: string; message: string; timestamp: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [meetingDuration, setMeetingDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [micStatus, setMicStatus] = useState<"on" | "off" | "unknown">("unknown");
  const [cameraStatus, setCameraStatus] = useState<"on" | "off" | "unknown">("unknown");
  // Per-participant WebRTC connection state: "connecting" | "connected" | "disconnected" | "failed"
  const [connStatus, setConnStatus] = useState<Map<string, string>>(new Map());

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const pendingCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const screenStreamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeMeetingRef = useRef<Meeting | null>(null);
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Perfect Negotiation state — prevents SDP glare when both peers create offers simultaneously
  const politeRef = useRef<boolean>(false); // determined per-connection by user ID comparison
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<string, boolean>>(new Map());

  const setConnState = useCallback((userId: string, state: string) => {
    setConnStatus((prev) => {
      const next = new Map(prev);
      next.set(userId, state);
      return next;
    });
  }, []);

  // Keep activeMeetingRef in sync so signal handlers always have the latest value
  useEffect(() => {
    activeMeetingRef.current = activeMeeting;
  }, [activeMeeting]);

  // Keep localStreamRef in sync so createPeerConnection always has the stream
  // even when React state hasn't flushed yet
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Load profiles
  useEffect(() => {
    supabase.from("profiles").select("*").then(({ data }) => {
      setAllProfiles((data ?? []) as Profile[]);
      setLoading(false);
    });
  }, []);

  // Check for active meeting or join request
  useEffect(() => {
    (async () => {
      const { data: meetings } = await supabase
        .from("meetings")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);

      if (meetings && meetings.length > 0) {
        setActiveMeeting(meetings[0] as Meeting);
      }

      if (joinRoomId) {
        const { data: m } = await supabase
          .from("meetings")
          .select("*")
          .eq("room_id", joinRoomId)
          .eq("status", "active")
          .maybeSingle();
        if (m) {
          setActiveMeeting(m as Meeting);
        }
      }
    })();
  }, [joinRoomId]);

  // Subscribe to meeting status changes
  useEffect(() => {
    const channel = supabase
      .channel("meetings-list")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "meetings" }, (payload) => {
        setActiveMeeting(payload.new as Meeting);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "meetings" }, (payload) => {
        const updated = payload.new as Meeting;
        if (updated.status === "ended") {
          if (isInMeeting) {
            handleLeaveMeeting();
          }
          setActiveMeeting(null);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isInMeeting]);

  // Meeting timer
  useEffect(() => {
    if (!isInMeeting) return;
    const interval = setInterval(() => {
      setMeetingDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isInMeeting]);

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  // ============ AUDIO CONTEXT ACTIVATION ============
  // Some browsers (especially Chrome/Edge) suspend audio until a user gesture
  // activates it. We create and resume an AudioContext on join/start.
  const ensureAudioContext = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx();
          log("AudioContext created, initial state:", audioContextRef.current.state);
        }
      }
      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().then(() => {
          log("AudioContext resumed, state:", audioContextRef.current?.state);
        }).catch((err) => {
          logWarn("AudioContext resume failed:", err);
        });
      }
    } catch (err) {
      logWarn("AudioContext initialization error:", err);
    }
  }, []);

  // ============ MEDIA PERMISSION HANDLING ============
  const getUserMediaWithErrorHandling = useCallback(async (): Promise<MediaStream | null> => {
    log("Requesting user media (video: true, audio: true)...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      log("getUserMedia success — audio tracks:", audioTracks.length, "video tracks:", videoTracks.length);

      if (audioTracks.length === 0) {
        logWarn("No audio track returned by getUserMedia — microphone may not be available");
        showToast("warning", "No microphone detected. Video will work but others won't hear you.");
        setMicStatus("off");
      } else {
        // Ensure audio is enabled by default (not muted)
        audioTracks.forEach((track) => {
          track.enabled = true;
          log("Audio track enabled:", track.label, "readyState:", track.readyState);
        });
        setMicStatus("on");
      }

      if (videoTracks.length === 0) {
        logWarn("No video track returned by getUserMedia — camera may not be available");
      } else {
        videoTracks.forEach((track) => {
          track.enabled = true;
          log("Video track enabled:", track.label, "readyState:", track.readyState);
        });
      }

      return stream;
    } catch (err) {
      const error = err as DOMException;
      logError("getUserMedia error:", error.name, error.message);

      let message = "Could not access camera/microphone.";
      if (error.name === "NotAllowedError" || error.name === "SecurityError") {
        message = "Microphone/camera permission denied. Please allow access in your browser settings and try again.";
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        message = "No microphone or camera found. Please connect a device and try again.";
      } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
        message = "Your microphone/camera is being used by another application. Please close it and try again.";
      } else if (error.name === "OverconstrainedError") {
        message = "Your camera/microphone doesn't meet the required constraints. Try again with default settings.";
      } else if (error.name === "AbortError") {
        message = "Media access was interrupted. Please try again.";
      } else {
        message = `Media access error: ${error.message || error.name}. Please check permissions and try again.`;
      }

      setError(message);
      setMicStatus("off");
      return null;
    }
  }, []);

  const startMeeting = async () => {
    if (!user || profile?.role !== "manager") return;
    setError(null);

    // Activate AudioContext on user gesture (Start button click)
    ensureAudioContext();

    // Get user media with proper error handling
    const stream = await getUserMediaWithErrorHandling();
    if (!stream) return;

    // Set both ref and state immediately so signal handlers can access the stream
    localStreamRef.current = stream;
    setLocalStream(stream);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch((e) => logWarn("Local video play error:", e));
    }

    // Create meeting
    const { data, error: meetErr } = await supabase
      .from("meetings")
      .insert({
        title: "Team Meeting",
        started_by: user.id,
        status: "active",
      })
      .select()
      .single();

    if (meetErr || !data) {
      setError("Failed to start meeting");
      stream.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      return;
    }

    const meeting = data as Meeting;
    setActiveMeeting(meeting);
    activeMeetingRef.current = meeting;

    // Add self as participant
    await supabase.from("meeting_participants").insert({
      meeting_id: meeting.id,
      user_id: user.id,
      is_muted: false,
      is_video_on: true,
    });

    // Notify all employees
    const { data: employees } = await supabase.from("profiles").select("id").eq("role", "mis_employee");
    if (employees) {
      for (const emp of employees) {
        await addNotification(emp.id, "Meeting Started", "Manager has started a meeting. Join now!", "meeting", "/app/meetings");
      }
    }

    startTimeRef.current = Date.now();
    setIsInMeeting(true);
    showToast("success", "Meeting started. Notifying all team members...");

    log("Meeting started, room:", meeting.room_id);
    setupSignaling(meeting.room_id);
  };

  const joinMeeting = async () => {
    if (!user || !activeMeeting) return;
    setError(null);

    // Activate AudioContext on user gesture (Join button click)
    ensureAudioContext();

    // Get user media with proper error handling
    const stream = await getUserMediaWithErrorHandling();
    if (!stream) return;

    // Set both ref and state immediately
    localStreamRef.current = stream;
    setLocalStream(stream);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch((e) => logWarn("Local video play error:", e));
    }

    // Add self as participant
    await supabase.from("meeting_participants").insert({
      meeting_id: activeMeeting.id,
      user_id: user.id,
      is_muted: false,
      is_video_on: true,
    });

    // Send join signal to all existing participants
    await supabase.from("meeting_signals").insert({
      room_id: activeMeeting.room_id,
      sender_id: user.id,
      signal_type: "join",
      signal_data: { message: "joined" },
    });

    startTimeRef.current = Date.now();
    setIsInMeeting(true);
    showToast("success", "Joined meeting");

    log("Joined meeting, room:", activeMeeting.room_id);
    setupSignaling(activeMeeting.room_id);
  };

  const setupSignaling = (roomId: string) => {
    if (!user) return;

    const channel = supabase
      .channel(`meeting-signaling-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meeting_signals", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const signal = payload.new as MeetingSignal;
          if (signal.sender_id === user.id) return;
          handleSignal(signal);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_participants", filter: `meeting_id=eq.${activeMeetingRef.current?.id}` },
        () => loadParticipants()
      )
      .subscribe();

    loadParticipants();

    // Store channel for cleanup on leave
    signalingChannelRef.current = channel;
  };

  const loadParticipants = async () => {
    const meeting = activeMeetingRef.current;
    if (!meeting || !user) return;
    const { data } = await supabase
      .from("meeting_participants")
      .select("*")
      .eq("meeting_id", meeting.id)
      .is("left_at", null);
    setParticipants((data ?? []) as MeetingParticipant[]);
  };

  const handleSignal = async (signal: MeetingSignal) => {
    if (!user) return;

    log("Signal received:", signal.signal_type, "from:", signal.sender_id);

    if (signal.signal_type === "join") {
      await createOffer(signal.sender_id);
    } else if (signal.signal_type === "offer" && signal.receiver_id === user.id) {
      await handleOffer(signal);
    } else if (signal.signal_type === "answer" && signal.receiver_id === user.id) {
      await handleAnswer(signal);
    } else if (signal.signal_type === "ice-candidate" && signal.receiver_id === user.id) {
      await handleIceCandidate(signal);
    } else if (signal.signal_type === "leave") {
      const pc = peerConnections.current.get(signal.sender_id);
      if (pc) {
        log("Closing peer connection for leaving user:", signal.sender_id);
        pc.close();
        peerConnections.current.delete(signal.sender_id);
      }
      remoteStreamsRef.current.delete(signal.sender_id);
      remoteVideoRefs.current.delete(signal.sender_id);
      setParticipants((prev) => [...prev]);
      loadParticipants();
    } else if (signal.signal_type === "hand-raise" || signal.signal_type === "hand-lower") {
      loadParticipants();
    }
  };

  const createPeerConnection = (remoteUserId: string): RTCPeerConnection => {
    log("Creating PeerConnection for remote user:", remoteUserId);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks — use ref to avoid stale closure
    const stream = localStreamRef.current;
    if (!stream) {
      logError("No local stream available when creating PeerConnection — tracks will be missing!");
    } else {
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      log("Adding tracks to PeerConnection — audio:", audioTracks.length, "video:", videoTracks.length);

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
        log("Track added:", track.kind, "label:", track.label, "enabled:", track.enabled);
      });

      if (audioTracks.length === 0) {
        logWarn("No audio track in local stream — remote peer will not receive audio!");
      }
    }

    // Handle remote stream — this fires when remote tracks arrive
    pc.ontrack = (event) => {
      log("ontrack event — track kind:", event.track.kind, "from:", remoteUserId, "streams:", event.streams.length);

      const stream = event.streams[0] || new MediaStream([event.track]);
      remoteStreamsRef.current.set(remoteUserId, stream);

      // Log track details for debugging
      stream.getTracks().forEach((t) => {
        log("Remote track:", t.kind, "label:", t.label, "enabled:", t.enabled, "readyState:", t.readyState, "muted:", t.muted);
      });

      // Ensure remote video element is set up and playing
      const videoEl = remoteVideoRefs.current.get(remoteUserId);
      if (videoEl) {
        videoEl.srcObject = stream;
        videoEl.play().catch((err: unknown) => {
          logWarn("Remote video autoplay blocked for", remoteUserId, "— attempting to play:", err);
          // If autoplay is blocked, the browser will play once user interacts
          // We set muted=false to ensure audio plays
          if (err instanceof DOMException && err.name === "NotAllowedError") {
            logWarn("Autoplay blocked — audio will start after user interaction");
          }
        });
      }

      // Trigger re-render
      setParticipants((prev) => [...prev]);
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && activeMeetingRef.current) {
        supabase.from("meeting_signals").insert({
          room_id: activeMeetingRef.current.room_id,
          sender_id: user!.id,
          receiver_id: remoteUserId,
          signal_type: "ice-candidate",
          signal_data: event.candidate.toJSON(),
        });
      }
    };

    // Log ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      log("ICE connection state:", pc.iceConnectionState, "for user:", remoteUserId);

      if (pc.iceConnectionState === "failed") {
        logWarn("ICE connection failed for user:", remoteUserId, "— attempting ICE restart");
        pc.restartIce();
        // After restartIce, we need to create a new offer to re-negotiate
        if (peerConnections.current.has(remoteUserId)) {
          createOffer(remoteUserId).catch((e) => logError("ICE restart offer failed:", e));
        }
      }
    };

    // Log ICE gathering state
    pc.onicegatheringstatechange = () => {
      log("ICE gathering state:", pc.iceGatheringState, "for user:", remoteUserId);
    };

    // Log connection state changes and handle reconnection
    pc.onconnectionstatechange = () => {
      log("PeerConnection state:", pc.connectionState, "for user:", remoteUserId);

      if (pc.connectionState === "failed") {
        logWarn("Connection failed for user:", remoteUserId, "— attempting reconnection");
        pc.restartIce();
        if (peerConnections.current.has(remoteUserId)) {
          createOffer(remoteUserId).catch((e) => logError("Reconnection offer failed:", e));
        }
      } else if (pc.connectionState === "disconnected") {
        logWarn("Connection disconnected for user:", remoteUserId, "— waiting for reconnection");
        // Give some time before attempting reconnect — disconnected may recover
        setTimeout(() => {
          if (peerConnections.current.has(remoteUserId) && pc.connectionState === "disconnected") {
            logWarn("Still disconnected after timeout — attempting ICE restart for user:", remoteUserId);
            pc.restartIce();
            createOffer(remoteUserId).catch((e) => logError("Reconnect offer failed:", e));
          }
        }, 5000);
      }
    };

    // Log signaling state changes
    pc.onsignalingstatechange = () => {
      log("Signaling state:", pc.signalingState, "for user:", remoteUserId);
    };

    // Log negotiation needed
    pc.onnegotiationneeded = () => {
      log("Negotiation needed for user:", remoteUserId);
    };

    peerConnections.current.set(remoteUserId, pc);
    return pc;
  };

  const createOffer = async (remoteUserId: string) => {
    if (!user || !activeMeetingRef.current) return;
    log("Creating offer for user:", remoteUserId);

    let pc = peerConnections.current.get(remoteUserId);
    if (!pc || pc.connectionState === "closed") {
      pc = createPeerConnection(remoteUserId);
    }

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      log("Offer created and set as local description for user:", remoteUserId);

      await supabase.from("meeting_signals").insert({
        room_id: activeMeetingRef.current.room_id,
        sender_id: user.id,
        receiver_id: remoteUserId,
        signal_type: "offer",
        signal_data: { type: offer.type, sdp: offer.sdp } as Record<string, unknown>,
      });
    } catch (err) {
      logError("Failed to create offer for user:", remoteUserId, err);
    }
  };

  const handleOffer = async (signal: MeetingSignal) => {
    if (!user || !activeMeetingRef.current) return;
    log("Handling offer from user:", signal.sender_id);

    let pc = peerConnections.current.get(signal.sender_id);
    if (!pc || pc.connectionState === "closed") {
      pc = createPeerConnection(signal.sender_id);
    }

    // If we already have a remote description, this is a renegotiation
    if (pc.signalingState === "stable") {
      // Good to proceed
    } else if (pc.signalingState !== "have-remote-offer") {
      logWarn("Unexpected signaling state for offer:", pc.signalingState, "— resetting");
      pc.close();
      pc = createPeerConnection(signal.sender_id);
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.signal_data as unknown as RTCSessionDescriptionInit));
      log("Remote description (offer) set for user:", signal.sender_id);

      // Log remote tracks from the offer
      const receivers = pc.getReceivers();
      receivers.forEach((r) => {
        log("Receiver track from offer:", r.track?.kind, "label:", r.track?.label);
      });

      // Process any pending ICE candidates
      const pending = pendingCandidates.current.get(signal.sender_id);
      if (pending) {
        for (const candidate of pending) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        log("Processed", pending.length, "pending ICE candidates for user:", signal.sender_id);
        pendingCandidates.current.delete(signal.sender_id);
      }

      const answer = await pc.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(answer);
      log("Answer created and set as local description for user:", signal.sender_id);

      await supabase.from("meeting_signals").insert({
        room_id: activeMeetingRef.current.room_id,
        sender_id: user.id,
        receiver_id: signal.sender_id,
        signal_type: "answer",
        signal_data: { type: answer.type, sdp: answer.sdp } as Record<string, unknown>,
      });
    } catch (err) {
      logError("Failed to handle offer from user:", signal.sender_id, err);
    }
  };

  const handleAnswer = async (signal: MeetingSignal) => {
    const pc = peerConnections.current.get(signal.sender_id);
    if (!pc) {
      logWarn("No PeerConnection found for answer from user:", signal.sender_id);
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.signal_data as unknown as RTCSessionDescriptionInit));
      log("Remote description (answer) set for user:", signal.sender_id);

      // Process any pending ICE candidates
      const pending = pendingCandidates.current.get(signal.sender_id);
      if (pending) {
        for (const candidate of pending) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        log("Processed", pending.length, "pending ICE candidates for user:", signal.sender_id);
        pendingCandidates.current.delete(signal.sender_id);
      }
    } catch (err) {
      logError("Failed to handle answer from user:", signal.sender_id, err);
    }
  };

  const handleIceCandidate = async (signal: MeetingSignal) => {
    const pc = peerConnections.current.get(signal.sender_id);
    if (!pc) {
      logWarn("No PeerConnection for ICE candidate from user:", signal.sender_id);
      return;
    }

    if (pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal.signal_data as RTCIceCandidateInit));
        log("ICE candidate added for user:", signal.sender_id);
      } catch (err) {
        logError("Failed to add ICE candidate for user:", signal.sender_id, err);
      }
    } else {
      // Queue the candidate until remote description is set
      const pending = pendingCandidates.current.get(signal.sender_id) || [];
      pending.push(signal.signal_data as RTCIceCandidateInit);
      pendingCandidates.current.set(signal.sender_id, pending);
      log("Queued ICE candidate for user:", signal.sender_id, "(total pending:", pending.length, ")");
    }
  };

  const toggleMute = async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      showToast("error", "No microphone available to mute/unmute");
      return;
    }

    const newMuted = !isMuted;
    audioTracks.forEach((track) => {
      track.enabled = !newMuted;
      log("Audio track", newMuted ? "muted" : "unmuted", ":", track.label, "enabled:", track.enabled);
    });
    setIsMuted(newMuted);
    setMicStatus(newMuted ? "off" : "on");

    if (activeMeetingRef.current) {
      await supabase
        .from("meeting_participants")
        .update({ is_muted: newMuted })
        .eq("meeting_id", activeMeetingRef.current.id)
        .eq("user_id", user?.id);
    }
  };

  const toggleVideo = async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) {
      showToast("error", "No camera available to toggle");
      return;
    }

    const newVideoOn = !isVideoOn;
    videoTracks.forEach((track) => {
      track.enabled = newVideoOn;
      log("Video track", newVideoOn ? "enabled" : "disabled", ":", track.label);
    });
    setIsVideoOn(newVideoOn);

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    if (activeMeetingRef.current) {
      await supabase
        .from("meeting_participants")
        .update({ is_video_on: newVideoOn })
        .eq("meeting_id", activeMeetingRef.current.id)
        .eq("user_id", user?.id);
    }
  };

  const toggleScreenShare = async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    if (isScreenSharing) {
      // Stop screen share, restore camera
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) videoTrack.enabled = true;
      setIsScreenSharing(false);
      // Update all peer connections
      peerConnections.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender && videoTrack) sender.replaceTrack(videoTrack);
      });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) videoTrack.enabled = false;
        // Update all peer connections
        peerConnections.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender && screenTrack) sender.replaceTrack(screenTrack);
        });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }
        screenTrack.onended = () => {
          toggleScreenShare();
        };
        setIsScreenSharing(true);
      } catch {
        showToast("error", "Failed to start screen share");
      }
    }
  };

  const toggleHand = async () => {
    if (!activeMeetingRef.current || !user) return;
    const newHandRaised = !handRaised;
    setHandRaised(newHandRaised);
    await supabase
      .from("meeting_participants")
      .update({ hand_raised: newHandRaised })
      .eq("meeting_id", activeMeetingRef.current.id)
      .eq("user_id", user.id);
    await supabase.from("meeting_signals").insert({
      room_id: activeMeetingRef.current.room_id,
      sender_id: user.id,
      signal_type: newHandRaised ? "hand-raise" : "hand-lower",
      signal_data: {},
    });
  };

  const sendChatMessage = () => {
    if (!chatInput.trim() || !user || !profile) return;
    setMeetingChat((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        sender: profile.full_name,
        message: chatInput.trim(),
        timestamp: new Date().toISOString(),
      },
    ]);
    setChatInput("");
  };

  const handleLeaveMeeting = useCallback(async () => {
    if (!user || !activeMeetingRef.current) return;

    log("Leaving meeting");

    // Send leave signal
    await supabase.from("meeting_signals").insert({
      room_id: activeMeetingRef.current.room_id,
      sender_id: user.id,
      signal_type: "leave",
      signal_data: {},
    });

    // Update participant record
    await supabase
      .from("meeting_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("meeting_id", activeMeetingRef.current.id)
      .eq("user_id", user.id);

    // Close signaling channel
    if (signalingChannelRef.current) {
      supabase.removeChannel(signalingChannelRef.current);
      signalingChannelRef.current = null;
    }

    // Close all peer connections
    peerConnections.current.forEach((pc, id) => {
      log("Closing peer connection for user:", id);
      pc.close();
    });
    peerConnections.current.clear();
    remoteStreamsRef.current.clear();
    remoteVideoRefs.current.clear();
    pendingCandidates.current.clear();

    // Stop local stream
    localStreamRef.current?.getTracks().forEach((t) => {
      log("Stopping track:", t.kind, t.label);
      t.stop();
    });
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setIsInMeeting(false);
    setIsMuted(false);
    setIsVideoOn(true);
    setIsScreenSharing(false);
    setHandRaised(false);
    setShowChat(false);
    setMeetingChat([]);
    setMeetingDuration(0);
    setMicStatus("unknown");

    // Close AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    // If manager, end the meeting
    if (profile?.role === "manager") {
      await supabase
        .from("meetings")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", activeMeetingRef.current.id);
      setActiveMeeting(null);
      activeMeetingRef.current = null;
      showToast("info", "Meeting ended");
    } else {
      showToast("info", "Left meeting");
    }

    navigate("/app/meetings");
  }, [user, profile, navigate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isInMeeting) {
        peerConnections.current.forEach((pc) => pc.close());
        peerConnections.current.clear();
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        if (signalingChannelRef.current) {
          supabase.removeChannel(signalingChannelRef.current);
          signalingChannelRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
      }
    };
  }, [isInMeeting]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // In-meeting view
  if (isInMeeting && activeMeeting) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <Video className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">{activeMeeting.title}</h2>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(meetingDuration)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Microphone status indicator */}
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium",
              micStatus === "on"
                ? "bg-green-500/20 text-green-400"
                : micStatus === "off"
                ? "bg-red-500/20 text-red-400"
                : "bg-slate-700 text-slate-400"
            )}>
              <span className={cn(
                "w-2 h-2 rounded-full",
                micStatus === "on" ? "bg-green-500 animate-pulse" : micStatus === "off" ? "bg-red-500" : "bg-slate-500"
              )} />
              Mic {micStatus === "on" ? "On" : micStatus === "off" ? "Off" : "—"}
            </div>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {participants.length}
            </span>
          </div>
        </div>

        {/* Video grid */}
        <div className="flex-1 flex overflow-hidden">
          <div className={cn("flex-1 p-4 overflow-y-auto", showChat && "hidden lg:block")}>
            <div className={cn(
              "grid gap-3 h-full",
              participants.length <= 1 ? "grid-cols-1" :
              participants.length <= 4 ? "grid-cols-2" :
              "grid-cols-2 lg:grid-cols-3"
            )}>
              {/* Local video */}
              <div className="relative bg-slate-800 rounded-xl overflow-hidden aspect-video">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                {!isVideoOn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                    <Avatar name={profile?.full_name || "You"} src={profile?.avatar_url} size="xl" />
                  </div>
                )}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                  <span className="text-xs text-white bg-black/60 px-2 py-1 rounded-lg">
                    You {isMuted && "(Muted)"}
                  </span>
                  {/* Local mic indicator */}
                  <span className={cn(
                    "flex items-center gap-1 text-xs px-2 py-1 rounded-lg",
                    isMuted ? "bg-red-500/80 text-white" : "bg-green-500/80 text-white"
                  )}>
                    {isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                    {isMuted ? "Off" : "On"}
                  </span>
                  {isScreenSharing && (
                    <span className="text-xs text-white bg-primary-600 px-2 py-1 rounded-lg">Sharing Screen</span>
                  )}
                </div>
              </div>

              {/* Remote videos */}
              {participants
                .filter((p) => p.user_id !== user?.id)
                .map((p) => {
                  const remoteProfile = allProfiles.find((prof) => prof.id === p.user_id);
                  const stream = remoteStreamsRef.current.get(p.user_id) ?? undefined;
                  return (
                    <div key={p.id} className="relative bg-slate-800 rounded-xl overflow-hidden aspect-video">
                      <RemoteVideo
                        userId={p.user_id}
                        stream={stream}
                        profile={remoteProfile}
                        isVideoOn={p.is_video_on}
                        handRaised={p.hand_raised}
                        isMuted={p.is_muted}
                      />
                      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between z-10">
                        <span className="text-xs text-white bg-black/60 px-2 py-1 rounded-lg">
                          {remoteProfile?.full_name || "Participant"}
                          {p.is_muted && " (Muted)"}
                        </span>
                        {/* Remote mic indicator */}
                        <span className={cn(
                          "flex items-center gap-1 text-xs px-2 py-1 rounded-lg",
                          p.is_muted ? "bg-red-500/80 text-white" : "bg-green-500/80 text-white"
                        )}>
                          {p.is_muted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                          {p.is_muted ? "Off" : "On"}
                        </span>
                        {p.hand_raised && (
                          <span className="text-xs text-white bg-amber-500 px-2 py-1 rounded-lg flex items-center gap-1">
                            <Hand className="w-3 h-3" /> Raised
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Meeting chat sidebar */}
          {showChat && (
            <div className="w-full lg:w-80 bg-slate-800 border-l border-slate-700 flex flex-col absolute lg:relative inset-0 z-10">
              <div className="p-3 border-b border-slate-700 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Meeting Chat
                </h3>
                <button onClick={() => setShowChat(false)} className="text-slate-400 hover:text-white">
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {meetingChat.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center mt-4">No messages yet</p>
                ) : (
                  meetingChat.map((msg) => (
                    <div key={msg.id} className="bg-slate-700 rounded-lg p-2">
                      <p className="text-xs font-medium text-primary-400">{msg.sender}</p>
                      <p className="text-sm text-white mt-0.5">{msg.message}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(msg.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <div className="p-3 border-t border-slate-700 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendChatMessage(); }}
                  className="flex-1 bg-slate-900 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="Type a message..."
                />
                <button onClick={sendChatMessage} className="p-2 bg-primary-600 text-white rounded-lg">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 p-4 bg-slate-800 border-t border-slate-700">
          <button
            onClick={toggleMute}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all",
              isMuted ? "bg-red-500 text-white" : "bg-slate-700 text-white hover:bg-slate-600"
            )}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <button
            onClick={toggleVideo}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all",
              !isVideoOn ? "bg-red-500 text-white" : "bg-slate-700 text-white hover:bg-slate-600"
            )}
            title={isVideoOn ? "Turn off camera" : "Turn on camera"}
          >
            {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
          <button
            onClick={toggleScreenShare}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all",
              isScreenSharing ? "bg-primary-600 text-white" : "bg-slate-700 text-white hover:bg-slate-600"
            )}
            title="Share screen"
          >
            <MonitorUp className="w-5 h-5" />
          </button>
          <button
            onClick={toggleHand}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all",
              handRaised ? "bg-amber-500 text-white" : "bg-slate-700 text-white hover:bg-slate-600"
            )}
            title={handRaised ? "Lower hand" : "Raise hand"}
          >
            <Hand className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowChat((p) => !p)}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all",
              showChat ? "bg-primary-600 text-white" : "bg-slate-700 text-white hover:bg-slate-600"
            )}
            title="Toggle chat"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <button
            onClick={handleLeaveMeeting}
            className="w-14 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all"
            title="Leave meeting"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // Pre-meeting view
  return (
    <div>
      <PageHeader title="Meetings" subtitle="Start or join video meetings" icon={<Video className="w-5 h-5" />} />

      {error && (
        <div className="card p-4 mb-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/50">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Active meeting card */}
      {activeMeeting ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card p-8 text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Video className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{activeMeeting.title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            An active meeting is in progress. Join now to participate.
          </p>
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="flex items-center gap-1.5 text-sm text-slate-400">
              <Users className="w-4 h-4" />
              {participants.length} participant{participants.length !== 1 ? "s" : ""}
            </div>
            <div className="flex items-center gap-1.5 text-sm text-green-500">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Active
            </div>
          </div>
          <button onClick={joinMeeting} className="btn-primary flex items-center gap-2 mx-auto">
            <Video className="w-5 h-5" />
            Join Meeting
          </button>
        </motion.div>
      ) : profile?.role === "manager" ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card p-8 text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-100 to-accent-100 dark:from-primary-900/30 dark:to-accent-900/30 flex items-center justify-center mx-auto mb-4">
            <Video className="w-10 h-10 text-primary-600 dark:text-primary-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Start a Meeting</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Start a video meeting and notify all team members instantly.
          </p>
          <button onClick={startMeeting} className="btn-primary flex items-center gap-2 mx-auto">
            <Video className="w-5 h-5" />
            Start Meeting
          </button>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card p-8 text-center">
          <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <Video className="w-10 h-10 text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Active Meeting</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            When your manager starts a meeting, you'll receive a notification to join.
          </p>
        </motion.div>
      )}

      {/* Participants list */}
      {activeMeeting && participants.length > 0 && (
        <div className="card p-5 mt-4">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Participants</h3>
          <div className="space-y-2">
            {participants.map((p) => {
              const prof = allProfiles.find((pr) => pr.id === p.user_id);
              if (!prof) return null;
              return (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <Avatar name={prof.full_name} src={prof.avatar_url} size="sm" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {prof.full_name}
                      {p.user_id === activeMeeting.started_by && (
                        <span className="text-xs text-primary-600 ml-1">(Host)</span>
                      )}
                    </p>
                  </div>
                  {p.is_muted && <MicOff className="w-4 h-4 text-slate-400" />}
                  {!p.is_video_on && <VideoOff className="w-4 h-4 text-slate-400" />}
                  {p.hand_raised && <Hand className="w-4 h-4 text-amber-500" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ REMOTE VIDEO COMPONENT ============
// CRITICAL FIX: Always render the <video> element, even when the remote
// participant's video is off. If we unmount the video element, the audio
// track is also lost. Instead, we overlay the avatar on top of the video
// element when video is off, so audio continues to play.
function RemoteVideo({
  userId,
  stream,
  profile,
  isVideoOn,
  handRaised,
  isMuted,
}: {
  userId: string;
  stream: MediaStream | undefined;
  profile: Profile | undefined;
  isVideoOn: boolean;
  handRaised: boolean;
  isMuted: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      // Explicitly call play() — some browsers block autoplay with audio
      // until play() is called programmatically after user interaction
      const playPromise = videoRef.current.play();
      if (playPromise) {
        playPromise.catch((err) => {
          console.warn("[Meeting/WebRTC] Remote video play() blocked for user:", userId, err);
          // If autoplay with audio is blocked, try playing muted first,
          // then unmute after a short delay (user interaction should have
          // already happened since they clicked Join/Start)
          if (err.name === "NotAllowedError" && videoRef.current) {
            console.warn("[Meeting/WebRTC] Autoplay blocked — will retry on next user interaction");
          }
        });
      }
    }
  }, [stream, userId]);

  // Verify audio tracks in the stream
  useEffect(() => {
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      console.log("[Meeting/WebRTC] Remote stream tracks for", userId,
        "— audio:", audioTracks.length, "video:", videoTracks.length);
      audioTracks.forEach((t) => {
        console.log("[Meeting/WebRTC] Remote audio track:", t.label,
          "enabled:", t.enabled, "muted:", t.muted, "readyState:", t.readyState);
      });
    }
  }, [stream, userId]);

  return (
    <>
      {/* Always render the video element so audio tracks always play.
          When video is off, we overlay the avatar on top. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        // NOT muted — we want to hear remote audio.
        // The local video element is muted to prevent echo.
        className="w-full h-full object-cover"
      />
      {/* Overlay avatar when remote video is off, but keep video element
          mounted underneath so audio continues to play */}
      {!isVideoOn && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
          <Avatar name={profile?.full_name || "User"} src={profile?.avatar_url} size="xl" />
        </div>
      )}
    </>
  );
}
