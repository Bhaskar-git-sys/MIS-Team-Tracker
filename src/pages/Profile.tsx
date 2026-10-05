import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { PageHeader } from "../components/shared/PageHeader";
import { Avatar } from "../components/shared/Avatar";
import { showToast } from "../components/shared/Toast";
import { supabase } from "../services/supabaseClient";
import { validatePhone } from "../utils/helpers";
import { User as UserIcon, Phone, Mail, KeyRound, Upload, Check, BadgeCent } from "lucide-react";

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    position: "",
  });
  const [passwordForm, setPasswordForm] = useState({ new_password: "" });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name,
        phone: profile.phone || "",
        position: profile.position || "",
      });
      setAvatarUrl(profile.avatar_url);
    }
  }, [profile]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("warning", "Image must be under 2MB");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) {
      showToast("error", "Failed to upload image");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    await supabase.from("profiles").update({ avatar_url: publicUrl, updated_at: new Date().toISOString() }).eq("id", user.id);
    setAvatarUrl(publicUrl);
    await refreshProfile();
    showToast("success", "Profile photo updated");
    setUploading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (form.phone && !validatePhone(form.phone)) {
      showToast("warning", "Phone must be exactly 10 digits");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name,
        phone: form.phone || null,
        position: form.position || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      showToast("error", "Failed to update profile");
    } else {
      await refreshProfile();
      showToast("success", "Profile updated successfully");
    }
    setSaving(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (passwordForm.new_password.length < 6) {
      showToast("warning", "Password must be at least 6 characters");
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: passwordForm.new_password });
    if (error) {
      showToast("error", error.message);
    } else {
      showToast("success", "Password changed successfully");
      setPasswordForm({ new_password: "" });
    }
    setSavingPassword(false);
  };

  if (!profile) return null;

  return (
    <div>
      <PageHeader title="My Profile" subtitle="Manage your personal information" icon={<UserIcon className="w-5 h-5" />} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile card */}
        <div className="lg:col-span-1">
          <div className="card p-6 text-center">
            <div className="relative inline-block">
              <Avatar name={profile.full_name} src={avatarUrl} size="xl" />
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-primary-600 hover:bg-primary-700 text-white rounded-full flex items-center justify-center cursor-pointer shadow-lg transition-colors">
                {uploading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={uploading} />
              </label>
            </div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white mt-4">{profile.full_name}</h3>
            <p className="text-sm text-slate-400">@{profile.username}</p>
            <p className="text-xs text-slate-400 mt-1">
              {profile.role === "manager" ? "Manager" : "MIS Executive"}
            </p>
            {profile.position && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{profile.position}</p>
            )}
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-2 text-sm text-left">
              {profile.employee_id && (
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <BadgeCent className="w-4 h-4 text-slate-400" />
                  <span className="font-medium">{profile.employee_id}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <Mail className="w-4 h-4 text-slate-400" />
                <span className="truncate">{profile.username}@kalyanimotors.com</span>
              </div>
              {profile.phone && (
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span>{profile.phone}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Edit forms */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal info */}
          <div className="card p-6">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Personal Information</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="label-text">Full Name</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="label-text">Phone (10 digits)</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setForm({ ...form, phone: digits });
                  }}
                  className={`input-field ${form.phone && !validatePhone(form.phone) ? "border-amber-400" : ""}`}
                  placeholder="9876543210"
                  maxLength={10}
                />
                {form.phone && !validatePhone(form.phone) && (
                  <p className="text-xs text-amber-500 mt-1">Must be exactly 10 digits, numbers only</p>
                )}
              </div>
              <div>
                <label className="label-text">Position</label>
                <input
                  type="text"
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  className="input-field"
                />
              </div>
              <button
                type="submit"
                disabled={saving || (!!form.phone && !validatePhone(form.phone))}
                className="btn-primary flex items-center gap-2"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Save Changes
              </button>
            </form>
          </div>

          {/* Change password */}
          <div className="card p-6">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Change Password</h3>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="label-text">New Password</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    value={passwordForm.new_password}
                    onChange={(e) => setPasswordForm({ new_password: e.target.value })}
                    className="input-field pl-11"
                    placeholder="Min 6 characters"
                    required
                    minLength={6}
                  />
                </div>
              </div>
              <button type="submit" disabled={savingPassword} className="btn-primary flex items-center gap-2">
                {savingPassword ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <KeyRound className="w-4 h-4" />
                )}
                Change Password
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
