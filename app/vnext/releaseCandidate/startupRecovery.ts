export const startupRecoveryMessage = (reason: unknown): Readonly<{ title: string; message: string }> => {
  const code = reason instanceof Error ? reason.message : "";
  if (code === "shadow-sync-update-required") return {
    title: "Update Parallette25 to continue",
    message: "This device needs a newer app version to open the latest synced training. Your saved work is kept. Check for an update below; keep the existing installation and storage.",
  };
  if (/Network unavailable|Connect once/u.test(code)) return {
    title: "Connect to finish opening your training",
    message: "This account needs an initial connection on this device. Connect and try again. Your existing saved work is kept.",
  };
  return {
    title: "Your training couldn’t open",
    message: "Try again, or open account options. You can export the training already saved on this device without clearing its storage.",
  };
};
