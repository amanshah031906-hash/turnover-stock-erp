// Purely presentational now — the toast text/visibility comes from the
// useToast() hook in whichever client page renders this.
export default function Toast({ toast, show }) {
  if (!toast) return null;

  return (
    <div className={`toast ${toast.isErr ? "err" : ""} ${show ? "show" : ""}`}>
      {toast.text}
    </div>
  );
}
