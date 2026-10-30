const statusMap = {
  NOT_COMPLETED: ["not-completed", "Not Completed"],
  COMPLETED: ["completed", "Pending Approval"],
  APPROVED: ["approved", "Approved"],
};

export default function Badge({ status }) {
  const [cls, label] = statusMap[status] ?? ["not-completed", status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
