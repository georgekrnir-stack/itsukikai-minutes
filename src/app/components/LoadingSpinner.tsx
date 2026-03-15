export function LoadingSpinner({
  size = "md",
  text,
  fullPage = false,
}: {
  size?: "sm" | "md";
  text?: string;
  fullPage?: boolean;
}) {
  const sizeClass = size === "sm" ? "w-4 h-4 border-2" : "w-6 h-6 border-2";
  const spinner = (
    <div className="flex items-center gap-3">
      <div className={`${sizeClass} border-blue-600 border-t-transparent rounded-full animate-spin`} />
      {text && <span className="text-sm text-gray-600">{text}</span>}
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        {spinner}
      </div>
    );
  }

  return spinner;
}
