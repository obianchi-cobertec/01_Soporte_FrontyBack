export function Loading({ message = 'Analizando tu consulta...' }: { message?: string }) {
  return (
    <div className="loading">
      <div className="spinner" />
      <p>{message}</p>
    </div>
  );
}
