import { InboxIcon } from "@heroicons/react/24/outline";

interface EmptyStateProps {
  title?: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({
  title = "No results found",
  message = "Try adjusting your search or filters.",
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
        <InboxIcon className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-base font-semibold text-slate-700 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="btn-liquid btn-liquid mt-4 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
