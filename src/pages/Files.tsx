import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { PageHeader } from "../components/shared/PageHeader";
import { showToast } from "../components/shared/Toast";
import { EDGE_FUNCTIONS, callEdgeFunction, supabase } from "../services/supabaseClient";
import { formatFileSize, getFileIcon, formatDate } from "../utils/helpers";
import type { FileRecord } from "../types";
import {
  FolderOpen,
  Upload,
  File,
  Image as ImageIcon,
  FileText,
  FileSpreadsheet,
  Trash2,
  Download,
} from "lucide-react";

const FILE_ICON_MAP: Record<string, typeof File> = {
  image: ImageIcon,
  pdf: FileText,
  excel: FileSpreadsheet,
  word: FileText,
  file: File,
};

export default function Files() {
  const { user, profile } = useAuth();
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadFiles();
  }, [user]);

  const loadFiles = async () => {
    if (!user) return;
    setLoading(true);
    await callEdgeFunction(EDGE_FUNCTIONS.cleanupExpiredFiles);
    // Manager sees all files, employee sees own
    let query = supabase.from("files").select("*").order("created_at", { ascending: false });
    if (profile?.role !== "manager") {
      query = query.eq("user_id", user.id);
    }
    const { data } = await query;
    const currentFiles = (data ?? []) as FileRecord[];
    const filesWithUrls = await Promise.all(
      currentFiles.map(async (file) => {
        if (!file.storage_path) return file;
        const { data: signedUrl } = await supabase.storage
          .from("uploads")
          .createSignedUrl(file.storage_path, 60 * 60);
        return { ...file, file_url: signedUrl?.signedUrl ?? "" };
      })
    );
    setFiles(filesWithUrls);
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast("warning", "File must be under 10MB");
      return;
    }

    setUploading(true);
    const fileName = `${user.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("uploads").upload(fileName, file);
    if (upErr) {
      showToast("error", "Failed to upload file");
      setUploading(false);
      return;
    }

    const { error: dbErr } = await supabase.from("files").insert({
      user_id: user.id,
      file_name: file.name,
      file_url: "",
      file_type: file.type,
      file_size: file.size,
      category: "general",
      storage_path: fileName,
      expires_at: expiryDate ? `${expiryDate}T23:59:59.999Z` : null,
    });

    if (dbErr) {
      showToast("error", "Failed to save file record");
    } else {
      showToast("success", "File uploaded successfully");
      loadFiles();
    }
    setExpiryDate("");
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (file: FileRecord) => {
    if (file.storage_path) {
      const { error: storageError } = await supabase.storage
        .from("uploads")
        .remove([file.storage_path]);
      if (storageError) {
        showToast("error", "Failed to delete the stored file");
        return;
      }
    }

    const { error } = await supabase.from("files").delete().eq("id", file.id);
    if (error) {
      showToast("error", "Failed to delete file");
    } else {
      showToast("success", "File deleted");
      loadFiles();
    }
  };

  return (
    <div>
      <PageHeader
        title="Files"
        subtitle="Upload and manage your files"
        icon={<FolderOpen className="w-5 h-5" />}
        actions={
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-primary text-sm flex items-center gap-2"
          >
            {uploading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Upload File
          </button>
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        onChange={handleUpload}
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
      />

      <div className="mb-5 flex items-center gap-3">
        <label className="text-sm text-slate-600 dark:text-slate-300" htmlFor="file-expiry">
          Available until
        </label>
        <input
          id="file-expiry"
          type="date"
          value={expiryDate}
          min={new Date().toISOString().split("T")[0]}
          onChange={(e) => setExpiryDate(e.target.value)}
          className="input-field w-auto"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : files.length === 0 ? (
        <div className="card p-12 text-center">
          <FolderOpen className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400">No files uploaded yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {files.map((file, i) => {
            const Icon = FILE_ICON_MAP[getFileIcon(file.file_type)] || File;
            return (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="card p-5"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{file.file_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatFileSize(file.file_size || 0)} • {formatDate(file.created_at)}
                      {file.expires_at && ` • Until ${formatDate(file.expires_at)}`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={file.file_url}
                    download={file.file_name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 btn-secondary text-xs flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </a>
                  {(profile?.role === "manager" || file.user_id === user?.id) && (
                    <button
                      onClick={() => handleDelete(file)}
                      className="px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-xl text-xs font-medium transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
