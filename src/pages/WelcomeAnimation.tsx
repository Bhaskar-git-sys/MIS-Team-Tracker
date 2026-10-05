import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";
import { useAuth } from "../contexts/AuthContext";
import { usePresence } from "../contexts/PresenceContext";
import { checkIn, getTodayAttendance } from "../services/attendanceService";
import { supabase } from "../services/supabaseClient";
import { callEdgeFunction, EDGE_FUNCTIONS } from "../services/supabaseClient";
import { CheckCircle2, Loader2, Fingerprint, Sparkles } from "lucide-react";

type Phase = "welcome" | "checkin_prompt" | "checking_in" | "complete";

export default function WelcomeAnimation() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { updateStatus } = usePresence();
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("welcome");
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [checkedOut, setCheckedOut] = useState(false);

  // Three.js scene
  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Particles
    const particleCount = 800;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const colorPalette = [
      new THREE.Color(0x0ea5e9), // primary
      new THREE.Color(0x14b8a6), // accent
      new THREE.Color(0x38bdf8), // primary-400
      new THREE.Color(0x2dd4bf), // accent-400
    ];

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 20;
      positions[i3 + 1] = (Math.random() - 0.5) * 20;
      positions[i3 + 2] = (Math.random() - 0.5) * 20;

      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Central glowing sphere
    const sphereGeo = new THREE.SphereGeometry(0.8, 64, 64);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.15,
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(sphere);

    // Wireframe sphere
    const wireGeo = new THREE.SphereGeometry(1.2, 32, 32);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x14b8a6,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    });
    const wireSphere = new THREE.Mesh(wireGeo, wireMat);
    scene.add(wireSphere);

    let animationId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();

      particles.rotation.y = elapsed * 0.05;
      particles.rotation.x = elapsed * 0.03;

      wireSphere.rotation.y = elapsed * 0.2;
      wireSphere.rotation.x = elapsed * 0.15;

      const scale = 1 + Math.sin(elapsed * 2) * 0.05;
      sphere.scale.set(scale, scale, scale);

      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      sphereGeo.dispose();
      sphereMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Check if already checked in
  useEffect(() => {
    if (!user) return;
    (async () => {
      const today = await getTodayAttendance(user.id);
      if (today?.check_in_at) {
        setAlreadyCheckedIn(true);
      }
      setCheckedOut(Boolean(today?.check_out_at));
      // Generate daily tasks from templates
      await callEdgeFunction(EDGE_FUNCTIONS.autoDailyTasks, {});
    })();
  }, [user]);

  // Phase transitions
  useEffect(() => {
    if (phase === "welcome") {
      const timer = setTimeout(() => setPhase("checkin_prompt"), 2500);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const handleCheckIn = async () => {
    if (!user) return;
    setPhase("checking_in");
    await checkIn(user.id);
    await updateStatus("online");
    // Log activity
    await supabase.from("activities").insert({
      user_id: user.id,
      type: "welcome_checkin",
      description: "Completed welcome check-in",
    });
    setTimeout(() => {
      setPhase("complete");
      setTimeout(() => navigate("/app"), 1200);
    }, 1500);
  };

  const handleSkipToDashboard = () => {
    navigate("/app");
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
      {/* Three.js canvas */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-slate-900/50" />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-4">
        <AnimatePresence mode="wait">
          {phase === "welcome" && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.8 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-400 to-accent-500 mb-6 shadow-2xl shadow-primary-500/50"
              >
                <Sparkles className="w-10 h-10 text-white" />
              </motion.div>
              <motion.h1
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-5xl sm:text-6xl font-bold text-white mb-3 tracking-tight"
              >
                Welcome
              </motion.h1>
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-xl text-slate-300"
              >
                {profile?.full_name}
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
                className="text-sm text-primary-400 mt-2 uppercase tracking-widest"
              >
                {profile?.role === "manager" ? "Manager" : "MIS Executive"}
              </motion.p>
            </motion.div>
          )}

          {(phase === "checkin_prompt" || phase === "checking_in") && (
            <motion.div
              key="checkin"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.5 }}
              className="text-center max-w-lg"
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Please complete today's Check In
              </h2>
              <p className="text-slate-300 mb-10">
                {checkedOut
                  ? "You have already checked out today. Check-in is unavailable."
                  : alreadyCheckedIn
                    ? "You're already checked in today. You can proceed to your dashboard."
                    : "Mark your attendance to unlock your dashboard and start your workday."}
              </p>

              {phase === "checking_in" ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center gap-4"
                >
                  <Loader2 className="w-16 h-16 text-primary-400 animate-spin" />
                  <p className="text-slate-300">Checking you in...</p>
                </motion.div>
              ) : !alreadyCheckedIn ? (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCheckIn}
                  className="group relative inline-flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-primary-500 to-accent-500 text-white rounded-2xl font-semibold text-lg shadow-2xl shadow-primary-500/50 hover:shadow-primary-500/70 transition-all duration-300 animate-pulse-glow"
                >
                  <Fingerprint className="w-7 h-7" />
                  Check In Now
                </motion.button>
              ) : null}

              {alreadyCheckedIn && !checkedOut && phase === "checkin_prompt" && (
                <div className="mt-6">
                  <button
                    onClick={handleSkipToDashboard}
                    className="text-primary-400 hover:text-primary-300 text-sm underline"
                  >
                    Go to Dashboard
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {phase === "complete" && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-500/20 mb-6"
              >
                <CheckCircle2 className="w-14 h-14 text-green-400" />
              </motion.div>
              <h2 className="text-3xl font-bold text-white mb-2">Check In Complete!</h2>
              <p className="text-slate-300">Redirecting to your dashboard...</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
