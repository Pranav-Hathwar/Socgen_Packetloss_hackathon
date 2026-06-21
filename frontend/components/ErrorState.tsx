import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
        <ExclamationTriangleIcon className="w-8 h-8 text-red-400" />
      </div>
      <h3 className="text-base font-semibold text-slate-700 mb-1">Something went wrong</h3>
      <p className="text-sm text-red-600 max-w-md mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-ink text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
}
