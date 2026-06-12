export function ReviewPermissionsNote() {
  return (
    <section
      aria-label="Permissions note"
      className="mb-6 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3"
    >
      <p className="text-sm leading-relaxed text-[#475569]">
        <span className="font-semibold text-[#1e293b]">Note:</span> All
        AI-generated actions will be previewed before execution. You maintain
        full control over what gets applied to your Canvas courses.
      </p>
    </section>
  );
}
