"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ModalState {
  open: boolean;
  title: string;
  message: string;
  mode: "confirm" | "alert";
  variant: "primary" | "danger";
  resolve: ((value: boolean) => void) | null;
}

export interface ModalProps {
  open: boolean;
  title: string;
  message: string;
  mode: "confirm" | "alert";
  variant: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function useModal() {
  const [state, setState] = useState<ModalState>({
    open: false,
    title: "",
    message: "",
    mode: "confirm",
    variant: "primary",
    resolve: null,
  });

  const showConfirm = useCallback(
    (title: string, message: string, variant: "primary" | "danger" = "primary"): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({ open: true, title, message, mode: "confirm", variant, resolve });
      });
    },
    []
  );

  const showAlert = useCallback(
    (title: string, message: string): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({ open: true, title, message, mode: "alert", variant: "primary", resolve });
      });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    state.resolve?.(true);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }, [state.resolve]);

  const handleCancel = useCallback(() => {
    state.resolve?.(false);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }, [state.resolve]);

  const modalProps: ModalProps = {
    open: state.open,
    title: state.title,
    message: state.message,
    mode: state.mode,
    variant: state.variant,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  };

  return { showConfirm, showAlert, modalProps };
}

export function Modal({ open, title, message, mode, variant, onConfirm, onCancel }: ModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    confirmRef.current?.focus();
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmClass =
    variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700"
      : "bg-blue-600 text-white hover:bg-blue-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-6 whitespace-pre-wrap">{message}</p>
        <div className="flex justify-end gap-3">
          {mode === "confirm" && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
            >
              キャンセル
            </button>
          )}
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded ${confirmClass}`}
          >
            {mode === "alert" ? "OK" : "確認"}
          </button>
        </div>
      </div>
    </div>
  );
}
