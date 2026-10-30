"use client";

import { useState } from "react";
import Toast from "@/components/Toast";
import { useToast } from "@/lib/useToast";
import { changeUsername, changePassword, logout } from "@/app/actions";

export default function AccountClient({ currentUsername }) {
  const { toast, show, notify } = useToast();

  const [currentPasswordForUsername, setCurrentPasswordForUsername] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);

  const [currentPasswordForPassword, setCurrentPasswordForPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  async function handleUsernameSave() {
    if (!newUsername.trim()) {
      notify("Enter a new username.", true);
      return;
    }
    setSavingUsername(true);
    const res = await changeUsername({
      currentPassword: currentPasswordForUsername,
      newUsername: newUsername.trim(),
    });
    setSavingUsername(false);
    if (res.ok) {
      notify("Username updated.");
      setCurrentPasswordForUsername("");
      setNewUsername("");
    } else {
      notify(res.message || "Could not update username.", true);
    }
  }

  async function handlePasswordSave() {
    if (newPassword !== confirmPassword) {
      notify("New passwords don't match.", true);
      return;
    }
    setSavingPassword(true);
    const res = await changePassword({
      currentPassword: currentPasswordForPassword,
      newPassword: newPassword,
    });
    setSavingPassword(false);
    if (res.ok) {
      notify("Password updated.");
      setCurrentPasswordForPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      notify(res.message || "Could not update password.", true);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Account</div>
          <h1>Account Settings</h1>
          <p>
            Signed in as <strong>{currentUsername}</strong>. Change your username or password below.
          </p>
        </div>
        <button className="btn outline" onClick={function () { logout(); }}>
          Log Out
        </button>
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <h2>Change Username</h2>
          <div className="field">
            <label>Current password</label>
            <input
              type="password"
              value={currentPasswordForUsername}
              onChange={function (e) { setCurrentPasswordForUsername(e.target.value); }}
            />
          </div>
          <div className="field">
            <label>New username</label>
            <input value={newUsername} onChange={function (e) { setNewUsername(e.target.value); }} placeholder={currentUsername} />
          </div>
          <button className="btn small" onClick={handleUsernameSave} disabled={savingUsername}>
            {savingUsername ? "Saving..." : "Update Username"}
          </button>
        </div>

        <div className="panel">
          <h2>Change Password</h2>
          <div className="field">
            <label>Current password</label>
            <input
              type="password"
              value={currentPasswordForPassword}
              onChange={function (e) { setCurrentPasswordForPassword(e.target.value); }}
            />
          </div>
          <div className="field">
            <label>New password</label>
            <input type="password" value={newPassword} onChange={function (e) { setNewPassword(e.target.value); }} />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input type="password" value={confirmPassword} onChange={function (e) { setConfirmPassword(e.target.value); }} />
          </div>
          <button className="btn small" onClick={handlePasswordSave} disabled={savingPassword}>
            {savingPassword ? "Saving..." : "Update Password"}
          </button>
        </div>
      </div>

      <Toast toast={toast} show={show} />
    </>
  );
}