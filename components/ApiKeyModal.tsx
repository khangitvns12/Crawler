'use client';

import React, { useState, useEffect } from 'react';
import { GeminiApiKey, KeyRotationStrategy } from '@/types/novel';
import {
  getStoredApiKeys,
  saveStoredApiKeys,
  addApiKey,
  bulkAddApiKeys,
  removeApiKey,
  toggleApiKeyActive,
  updateApiKeyStatus,
  getStoredRotationStrategy,
  saveStoredRotationStrategy,
  GEMINI_KEYS_CHANGED_EVENT,
} from '@/lib/api-key-storage';
import { safeFetchJson } from '@/lib/safe-json';
import {
  KeyRound,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ExternalLink,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Check,
  Layers,
  Shield,
  X,
  Sparkles,
} from 'lucide-react';

interface ApiKeyModalProps {
  onClose: () => void;
}

export default function ApiKeyModal({ onClose }: ApiKeyModalProps) {
  const [keys, setKeys] = useState<GeminiApiKey[]>(() => {
    if (typeof window !== 'undefined') {
      return getStoredApiKeys();
    }
    return [];
  });
  const [strategy, setStrategy] = useState<KeyRotationStrategy>(() => {
    if (typeof window !== 'undefined') {
      return getStoredRotationStrategy();
    }
    return 'round_robin';
  });
  const [mode, setMode] = useState<'single' | 'bulk'>('single');

  // Single key input form
  const [inputKey, setInputKey] = useState('');
  const [inputLabel, setInputLabel] = useState('');
  const [showKeyText, setShowKeyText] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Bulk input form
  const [bulkText, setBulkText] = useState('');

  // Per-key testing status
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Status message / toast
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Listen to external key changes
  useEffect(() => {
    const handleKeysChange = (e: Event) => {
      const customEvent = e as CustomEvent<GeminiApiKey[]>;
      if (customEvent.detail) {
        setKeys(customEvent.detail);
      } else {
        setKeys(getStoredApiKeys());
      }
    };

    window.addEventListener(GEMINI_KEYS_CHANGED_EVENT, handleKeysChange);
    return () => {
      window.removeEventListener(GEMINI_KEYS_CHANGED_EVENT, handleKeysChange);
    };
  }, []);

  const showFeedback = (message: string, type: 'success' | 'error' | 'info') => {
    setFeedback({ message, type });
    setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  // Test an individual API Key against Google Gemini API
  const handleTestKey = async (targetKey: GeminiApiKey) => {
    setTestingKeyId(targetKey.id);
    try {
      const { ok, data } = await safeFetchJson<any>('/api/keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: targetKey.key }),
      });

      if (ok && data?.valid) {
        updateApiKeyStatus(targetKey.id, 'active');
        showFeedback(`✓ Key "${targetKey.label}": Hợp lệ và sẵn sàng sử dụng!`, 'success');
      } else if (data?.isQuota) {
        updateApiKeyStatus(targetKey.id, 'rate_limited', data?.error);
        showFeedback(`⚠️ Key "${targetKey.label}": Hết hạn mức tạm thời (429 Rate Limit)`, 'error');
      } else {
        updateApiKeyStatus(targetKey.id, 'invalid', data?.error || 'API Key không hợp lệ');
        showFeedback(`✗ Key "${targetKey.label}": Không hợp lệ hoặc đã bị vô hiệu hóa`, 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      updateApiKeyStatus(targetKey.id, 'invalid', msg);
      showFeedback(`✗ Lỗi kiểm tra key: ${msg}`, 'error');
    } finally {
      setTestingKeyId(null);
    }
  };

  // Add single key
  const handleAddSingleKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputKey.trim()) return;

    const trimmed = inputKey.trim();
    if (trimmed.length < 15) {
      showFeedback('API Key quá ngắn, vui lòng kiểm tra lại.', 'error');
      return;
    }

    setIsAdding(true);
    const newEntry = addApiKey(trimmed, inputLabel.trim());
    setInputKey('');
    setInputLabel('');

    showFeedback(`Đã thêm key "${newEntry.label}". Đang kiểm tra kết nối...`, 'info');
    await handleTestKey(newEntry);
    setIsAdding(false);
  };

  // Add bulk keys
  const handleAddBulkKeys = () => {
    if (!bulkText.trim()) return;
    const added = bulkAddApiKeys(bulkText);
    setBulkText('');
    if (added.length === 0) {
      showFeedback('Không tìm thấy API Key Gemini hợp lệ nào (thường bắt đầu bằng "AIza...").', 'error');
    } else {
      showFeedback(`Đã thêm thành công ${added.length} API Key mới!`, 'success');
    }
  };

  // Delete key
  const handleDeleteKey = (id: string, label: string) => {
    removeApiKey(id);
    showFeedback(`Đã xóa key "${label}".`, 'info');
  };

  // Toggle active
  const handleToggleActive = (id: string) => {
    toggleApiKeyActive(id);
  };

  // Change strategy
  const handleChangeStrategy = (newStrategy: KeyRotationStrategy) => {
    setStrategy(newStrategy);
    saveStoredRotationStrategy(newStrategy);
  };

  // Copy key
  const handleCopyKey = (key: GeminiApiKey) => {
    navigator.clipboard.writeText(key.key);
    setCopiedKeyId(key.id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  // Mask key string for safe UI presentation
  const maskKey = (keyStr: string) => {
    if (keyStr.length <= 10) return '••••••••';
    return `${keyStr.substring(0, 7)}••••••••${keyStr.substring(keyStr.length - 4)}`;
  };

  const activeCount = keys.filter(k => k.isActive && k.status !== 'invalid').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Quản lý Gemini API Keys</h3>
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400 border border-amber-500/20">
                  Custom Keys
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Thêm nhiều API Key trực tiếp trên Web • Tự động xoay vòng • Vượt giới hạn Quota 15 RPM
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Feedback banner */}
          {feedback && (
            <div
              className={`rounded-xl px-4 py-2.5 text-xs font-medium border flex items-center gap-2 transition-all ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : feedback.type === 'error'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
              }`}
            >
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Quick Metrics & Strategy selector */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3.5 flex flex-col justify-between">
              <span className="text-[11px] text-slate-400">Tổng số Keys</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-white">{keys.length}</span>
                <span className="text-[11px] text-emerald-400 font-medium">({activeCount} đang bật)</span>
              </div>
            </div>

            <div className="sm:col-span-2 rounded-xl border border-slate-800/80 bg-slate-950/50 p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-medium">Chế độ phân phối Request:</span>
                <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                  {strategy === 'round_robin' ? 'Xoay vòng đều' : 'Dự phòng lỗi'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => handleChangeStrategy('round_robin')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium border transition-all ${
                    strategy === 'round_robin'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-sm'
                      : 'border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                  title="Xoay vòng đều giữa các API key giúp tăng thông lượng dịch truyện"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Xoay vòng (Round-Robin)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeStrategy('failover')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium border transition-all ${
                    strategy === 'failover'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-sm'
                      : 'border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                  title="Chỉ chuyển sang key tiếp theo khi key hiện tại bị giới hạn hạn mức 429"
                >
                  <Shield className="h-3.5 w-3.5" />
                  <span>Dự phòng (Failover)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Input section with Tabs */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setMode('single')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    mode === 'single'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Thêm 1 Key
                </button>
                <button
                  type="button"
                  onClick={() => setMode('bulk')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    mode === 'bulk'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Nhập hàng loạt (Bulk)
                </button>
              </div>

              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-medium transition-colors"
              >
                <span>Lấy Free API Key từ Google</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {mode === 'single' ? (
              <form onSubmit={handleAddSingleKey} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 relative">
                    <input
                      type={showKeyText ? 'text' : 'password'}
                      value={inputKey}
                      onChange={e => setInputKey(e.target.value)}
                      placeholder="Dán Gemini API Key (bắt đầu bằng AIzaSy...)"
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 pr-10 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeyText(!showKeyText)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                    >
                      {showKeyText ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div>
                    <input
                      type="text"
                      value={inputLabel}
                      onChange={e => setInputLabel(e.target.value)}
                      placeholder="Nhãn (vd: Key 1)"
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isAdding || !inputKey.trim()}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-semibold text-slate-950 shadow-md shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {isAdding ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    <span>Thêm & Kiểm tra Key</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <textarea
                  rows={4}
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  placeholder={`Dán danh sách các API Key, ngăn cách bởi dòng mới hoặc dấu phẩy:\nAIzaSyA123456789...\nAIzaSyB987654321...`}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs font-mono text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    Tự động nhận diện chuỗi API Key hợp lệ và lọc trùng.
                  </span>
                  <button
                    type="button"
                    onClick={handleAddBulkKeys}
                    disabled={!bulkText.trim()}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Thêm tất cả các Key</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* List of Keys */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Danh sách API Keys đã cấu hình ({keys.length})
              </h4>
              {keys.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    for (const k of keys) {
                      await handleTestKey(k);
                    }
                  }}
                  className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-amber-400 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Kiểm tra toàn bộ</span>
                </button>
              )}
            </div>

            {keys.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center space-y-3">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-400">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-300">Chưa có Custom API Key nào được lưu</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Hệ thống đang sử dụng key mặc định từ server. Hãy thêm key của riêng bạn để chủ động quản lý hạn mức dịch thuật.
                  </p>
                </div>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all"
                >
                  <span>Tạo API Key miễn phí tại Google AI Studio</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                {keys.map((k, index) => {
                  const isTesting = testingKeyId === k.id;
                  const isCopied = copiedKeyId === k.id;

                  return (
                    <div
                      key={k.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 transition-all ${
                        !k.isActive
                          ? 'border-slate-800/60 bg-slate-950/30 opacity-60'
                          : k.status === 'invalid'
                          ? 'border-rose-900/40 bg-rose-950/10'
                          : k.status === 'rate_limited'
                          ? 'border-amber-900/40 bg-amber-950/10'
                          : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-400">
                          {index + 1}
                        </span>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white truncate">
                              {k.label || `API Key ${index + 1}`}
                            </span>

                            {/* Status badge */}
                            {k.status === 'active' && (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                <span>Hoạt động</span>
                              </span>
                            )}
                            {k.status === 'rate_limited' && (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/20">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                <span>Hết Quota (429)</span>
                              </span>
                            )}
                            {k.status === 'invalid' && (
                              <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-400 border border-rose-500/20">
                                <XCircle className="h-2.5 w-2.5" />
                                <span>Lỗi Key</span>
                              </span>
                            )}
                            {(!k.status || k.status === 'untested') && (
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                                Chưa kiểm tra
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-mono text-[11px] text-slate-400">
                              {maskKey(k.key)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyKey(k)}
                              className="text-slate-500 hover:text-slate-300 transition-colors"
                              title="Sao chép Key"
                            >
                              {isCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                            </button>
                            {k.lastTestedAt && (
                              <span className="text-[10px] text-slate-500 hidden sm:inline">
                                • Kiểm tra {new Date(k.lastTestedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        {/* Test button */}
                        <button
                          type="button"
                          onClick={() => handleTestKey(k)}
                          disabled={isTesting}
                          className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-all disabled:opacity-50"
                        >
                          <RefreshCw className={`h-3 w-3 ${isTesting ? 'animate-spin text-amber-400' : ''}`} />
                          <span>{isTesting ? 'Đang test...' : 'Kiểm tra'}</span>
                        </button>

                        {/* Active toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleActive(k.id)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-medium border transition-all ${
                            k.isActive
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          {k.isActive ? 'Đang bật' : 'Đã tắt'}
                        </button>

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => handleDeleteKey(k.id, k.label || `Key ${index + 1}`)}
                          className="rounded-lg p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
                          title="Xóa Key này"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tips card */}
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-4 text-xs text-slate-300 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-indigo-300">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span>Mẹo sử dụng tối ưu hóa giới hạn Gemini</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
              <li>
                Bản miễn phí của Google AI Studio cho phép tối đa <strong>15 RPM (Request Per Minute)</strong> cho mỗi API Key.
              </li>
              <li>
                Khi bạn thêm <strong>2 đến 5 API Key</strong> (tạo từ các tài khoản Google khác nhau), hệ thống sẽ tự động xoay vòng giúp bạn cào và dịch truyện tốc độ cao liên tục mà không bao giờ bị dừng lại bởi lỗi giới hạn hạn mức (Rate Limit 429).
              </li>
              <li>
                Các API Key được lưu trực tiếp trong trình duyệt (LocalStorage) của bạn và được bảo mật an toàn, không lưu trữ công khai trên mã nguồn.
              </li>
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-3.5 bg-slate-950/50">
          <span className="text-[11px] text-slate-500">
            {activeCount > 0
              ? `Đang áp dụng ${activeCount} API Key cho các tác vụ dịch thuật.`
              : 'Chưa có API Key nào được kích hoạt.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
