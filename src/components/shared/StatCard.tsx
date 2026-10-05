import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  color?: "primary" | "accent" | "green" | "amber" | "red" | "blue";
  trend?: string;
}

const COLOR_MAP = {
  primary: "from-primary-500 to-primary-600 text-white",
  accent: "from-accent-500 to-accent-600 text-white",
  green: "from-green-500 to-green-600 text-white",
  amber: "from-amber-500 to-amber-600 text-white",
  red: "from-red-500 to-red-600 text-white",
  blue: "from-blue-500 to-blue-600 text-white",
};

export function StatCard({ title, value, icon, color = "primary", trend }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="card p-5"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
          {trend && (
            <p className="text-xs text-slate-400 mt-1">{trend}</p>
          )}
        </div>
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${COLOR_MAP[color]} flex items-center justify-center shadow-md`}>
          {icon}
        </div>
      </div>
    </motion.div>
  );
}
