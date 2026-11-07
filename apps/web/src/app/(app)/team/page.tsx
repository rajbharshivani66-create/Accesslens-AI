'use client';

import { ArrowRight, Copy, Plus, RefreshCw, Shield, Trash2, Users } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { useToast } from '@/components/app-shell/toast-provider';
import { useConfirm } from '@/components/app-shell/confirm-provider';

type TeamRole = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';
type AssignableRole = Exclude<TeamRole, 'OWNER'>;
type InvitationEmailStatus = 'NOT_CONFIGURED' | 'PENDING' | 'ACCEPTED' | 'FAILED';

interface TeamMember {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  role: TeamRole;
  joinedAt: string;
}

interface TeamInvitation {
  id: string;
  email: string;
  role: AssignableRole;
  emailStatus: InvitationEmailStatus;
  expiresAt: string;
  createdAt: string;
}

interface Team {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  myRole: TeamRole;
  currentMemberId: string;
  members: TeamMember[];
  invitations: TeamInvitation[];
}

interface TeamListItem {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  myRole: TeamRole;
}

interface IssuedInvitation extends TeamInvitation {
  inviteUrl: string;
}

const roles: AssignableRole[] = ['ADMIN', 'DEVELOPER', 'VIEWER'];

function invitationEmailStatusLabel(status: InvitationEmailStatus): string {
  switch (status) {
    case 'ACCEPTED':
      return 'Email provider accepted the message';
    case 'FAILED':
      return 'Email sending failed; share the link manually';
    case 'PENDING':
      return 'Email sending is pending';
    case 'NOT_CONFIGURED':
      return 'Email delivery is not configured; share the link manually';
  }
}

function displayRole(role: TeamRole): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export default function TeamPage() {
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [team, setTeam] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AssignableRole>('DEVELOPER');
  const [issuedInvitation, setIssuedInvitation] = useState<IssuedInvitation | null>(null);
  const [inviteToken, setInviteToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { pushToast } = useToast();
  const confirm = useConfirm();

  const refreshTeams = useCallback(async (preferredId?: string) => {
    const result = await apiRequest<TeamListItem[]>('/api/teams');
    setTeams(result);
    const nextId =
      preferredId && result.some((item) => item.id === preferredId)
        ? preferredId
        : result.some((item) => item.id === selectedId)
          ? selectedId
          : result[0]?.id ?? '';
    setSelectedId(nextId);
  }, [selectedId]);

  const refreshTeam = useCallback(async (teamId: string) => {
    if (!teamId) {
      setTeam(null);
      return;
    }
    const result = await apiRequest<Team>(`/api/teams/${teamId}`);
    setTeam(result);
    setTeamName(result.name);
    setTeamDescription(result.description ?? '');
  }, []);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('invite');
    if (token) setInviteToken(token);
    refreshTeams()
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load teams.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshTeams]);

  useEffect(() => {
    if (!selectedId) {
      setTeam(null);
      return;
    }
    let active = true;
    refreshTeam(selectedId)
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load this team.');
      });
    return () => {
      active = false;
    };
  }, [selectedId, refreshTeam]);

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await apiRequest<Team>('/api/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: newTeamName,
          description: newTeamDescription || undefined
        })
      });
      setNewTeamName('');
      setNewTeamDescription('');
      await refreshTeams(created.id);
      pushToast('success', 'Team created.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create team.');
    } finally {
      setBusy(false);
    }
  }

  async function saveTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!team) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest<Team>(`/api/teams/${team.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: teamName, description: teamDescription })
      });
      await refreshTeam(team.id);
      await refreshTeams(team.id);
      pushToast('success', 'Team details saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update team details.');
    } finally {
      setBusy(false);
    }
  }

  async function issueInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!team) return;
    setBusy(true);
    setError('');
    setIssuedInvitation(null);
    try {
      const invitation = await apiRequest<IssuedInvitation>(
        `/api/teams/${team.id}/invitations`,
        {
          method: 'POST',
          body: JSON.stringify({ email: inviteEmail, role: inviteRole })
        }
      );
      setIssuedInvitation(invitation);
      setInviteEmail('');
      await refreshTeam(team.id);
      pushToast('success', 'Invitation link created. Share it only with the intended recipient.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create invitation.');
    } finally {
      setBusy(false);
    }
  }

  async function acceptInvitation() {
    setBusy(true);
    setError('');
    try {
      const accepted = await apiRequest<{ id: string; name: string }>('/api/team-invitations/accept', {
        method: 'POST',
        body: JSON.stringify({ token: inviteToken })
      });
      window.history.replaceState(null, '', window.location.pathname);
      setInviteToken('');
      await refreshTeams(accepted.id);
      pushToast('success', `You joined ${accepted.name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not accept this invitation.');
    } finally {
      setBusy(false);
    }
  }

  async function updateMemberRole(member: TeamMember, role: AssignableRole) {
    if (!team) return;
    setBusy(true);
    setError('');
    try {
      const updated = await apiRequest<Team>(
        `/api/teams/${team.id}/members/${member.id}`,
        { method: 'PATCH', body: JSON.stringify({ role }) }
      );
      setTeam(updated);
      await refreshTeams(team.id);
      pushToast('success', 'Member role updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update member role.');
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: TeamMember) {
    if (!team) return;
    const action = member.id === team.currentMemberId
      ? `Leave ${team.name}?`
      : `Remove ${member.fullName || member.email} from ${team.name}?`;
    if (member.role === 'OWNER') return;
    const confirmed = await confirm({ title: member.id === team.currentMemberId ? 'Leave this team?' : 'Remove team member?', message: `${action} This will change their access to team projects.`, confirmLabel: member.id === team.currentMemberId ? 'Leave team' : 'Remove member' });
    if (!confirmed) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest<void>(`/api/teams/${team.id}/members/${member.id}`, {
        method: 'DELETE'
      });
      if (member.id === team.currentMemberId) {
        await refreshTeams();
      } else {
        await refreshTeam(team.id);
        await refreshTeams(team.id);
      }
      pushToast('success', 'Team member removed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove team member.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvitation(invitation: TeamInvitation) {
    if (!team) return;
    const confirmed = await confirm({ title: 'Revoke invitation?', message: `The invitation sent to ${invitation.email} will no longer work.`, confirmLabel: 'Revoke invitation' });
    if (!confirmed) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest<void>(
        `/api/teams/${team.id}/invitations/${invitation.id}`,
        { method: 'DELETE' }
      );
      await refreshTeam(team.id);
      pushToast('success', 'Invitation revoked.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not revoke invitation.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteTeam() {
    if (!team || team.myRole !== 'OWNER') return;
    const confirmed = await confirm({ title: `Delete ${team.name}?`, message: 'This deletes the team. Its projects will become private to you.', confirmLabel: 'Delete team' });
    if (!confirmed) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest<void>(`/api/teams/${team.id}`, { method: 'DELETE' });
      setTeam(null);
      await refreshTeams();
      pushToast('success', 'Team deleted.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the team.');
    } finally {
      setBusy(false);
    }
  }

  async function copyInvitation() {
    if (!issuedInvitation) return;
    try {
      await navigator.clipboard.writeText(issuedInvitation.inviteUrl);
      pushToast('success', 'Invitation link copied.');
    } catch {
      setError('Could not access the clipboard. Copy the invitation link manually.');
    }
  }

  const canManage = team?.myRole === 'OWNER' || team?.myRole === 'ADMIN';

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE</p>
          <h1>Teams</h1>
          <p className="muted">Share projects with members using role-based access.</p>
        </div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {inviteToken && (
        <section className="surface-card team-invite-accept">
          <div className="team-card-heading">
            <span className="empty-icon"><Shield size={20} /></span>
            <div>
              <h2>Team invitation</h2>
              <p className="muted">Accept using the signed-in email address the invite was sent to.</p>
            </div>
          </div>
          <button className="button button-primary" disabled={busy} onClick={() => void acceptInvitation()} type="button">
            {busy ? 'Accepting…' : 'Accept invitation'} <ArrowRight size={16} />
          </button>
        </section>
      )}

      <div className="team-page-grid">
        <aside className="surface-card team-list-card">
          <div className="card-heading">
            <div>
              <span className="card-kicker"><Users size={15} /> YOUR TEAMS</span>
              <h2>Teams</h2>
            </div>
            <button aria-label="Refresh teams" className="icon-button" disabled={loading} onClick={() => void refreshTeams()} type="button">
              <RefreshCw size={16} />
            </button>
          </div>
          {loading ? (
            <div aria-live="polite" className="loading-panel">Loading teams…</div>
          ) : teams.length === 0 ? (
            <p className="muted">You are not in any teams yet.</p>
          ) : (
            <div className="team-list">
              {teams.map((item) => (
                <button
                  aria-current={selectedId === item.id ? 'true' : undefined}
                  className={`team-list-item${selectedId === item.id ? ' team-list-item-active' : ''}`}
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  type="button"
                >
                  <span className="team-list-item-copy">
                    <strong>{item.name}</strong>
                    <span>{item.memberCount} members · {displayRole(item.myRole)}</span>
                  </span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
          )}
          <form className="form-stack team-create-form" onSubmit={(event) => void createTeam(event)}>
            <h3>Create a team</h3>
            <label>
              Team name
              <input maxLength={100} minLength={2} onChange={(event) => setNewTeamName(event.target.value)} required value={newTeamName} />
            </label>
            <label>
              Description <span className="optional-label">Optional</span>
              <textarea maxLength={500} onChange={(event) => setNewTeamDescription(event.target.value)} rows={2} value={newTeamDescription} />
            </label>
            <button className="button button-primary button-full" disabled={busy} type="submit">
              <Plus size={16} /> Create team
            </button>
          </form>
        </aside>

        {team ? (
          <div className="team-details-column">
            <section className="surface-card">
              <div className="team-detail-heading">
                <div>
                  <span className="card-kicker"><Users size={15} /> TEAM DETAILS</span>
                  <h2>{team.name}</h2>
                  <p className="muted">{team.memberCount} members · Your role: {displayRole(team.myRole)}</p>
                </div>
                {team.myRole === 'OWNER' && (
                  <button className="button button-danger-outline" disabled={busy} onClick={() => void deleteTeam()} type="button">
                    <Trash2 size={16} /> Delete team
                  </button>
                )}
              </div>
              {canManage && (
                <form className="form-stack team-edit-form" onSubmit={(event) => void saveTeam(event)}>
                  <label>
                    Team name
                    <input maxLength={100} minLength={2} onChange={(event) => setTeamName(event.target.value)} required value={teamName} />
                  </label>
                  <label>
                    Description
                    <textarea maxLength={500} onChange={(event) => setTeamDescription(event.target.value)} rows={2} value={teamDescription} />
                  </label>
                  <button className="button button-secondary" disabled={busy} type="submit">Save team details</button>
                </form>
              )}
              {!canManage && team.description && <p className="muted">{team.description}</p>}
            </section>

            <section className="surface-card">
              <div className="card-heading">
                <div><h2>Members</h2><p className="muted">Roles control access to team projects and management.</p></div>
              </div>
              <div className="team-member-list">
                {team.members.map((member) => {
                  const canManageMember =
                    canManage &&
                    member.role !== 'OWNER' &&
                    (team.myRole === 'OWNER' || member.role !== 'ADMIN');
                  const canRemove =
                    member.role !== 'OWNER' &&
                    (member.id === team.currentMemberId ||
                      (canManage && (team.myRole === 'OWNER' || member.role !== 'ADMIN')));
                  return (
                    <div className="team-member-row" key={member.id}>
                      <span className="team-member-avatar">{(member.fullName || member.email).slice(0, 1).toUpperCase()}</span>
                      <div className="team-member-copy">
                        <strong>{member.fullName || member.email}</strong>
                        <span>{member.fullName ? member.email : `Joined ${new Date(member.joinedAt).toLocaleDateString()}`}</span>
                      </div>
                      {canManageMember ? (
                        <label className="team-role-control">
                          <span className="sr-only">Role for {member.email}</span>
                          <select
                            disabled={busy}
                            onChange={(event) => void updateMemberRole(member, event.target.value as AssignableRole)}
                            value={member.role}
                          >
                            {roles.filter((role) => team.myRole === 'OWNER' || role !== 'ADMIN').map((role) => (
                              <option key={role} value={role}>{displayRole(role)}</option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <span className={`team-role-badge team-role-${member.role.toLowerCase()}`}>{displayRole(member.role)}</span>
                      )}
                      {canRemove && (
                        <button aria-label={`Remove ${member.email}`} className="icon-button danger-icon" disabled={busy} onClick={() => void removeMember(member)} type="button">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {canManage && (
              <>
                <section className="surface-card">
                  <div className="card-heading">
                    <div><h2>Invite a member</h2><p className="muted">Links expire in 7 days and can be used once by the invited email.</p></div>
                  </div>
                  <form className="team-invite-form" onSubmit={(event) => void issueInvitation(event)}>
                    <label>
                      Email address
                      <input autoComplete="email" onChange={(event) => setInviteEmail(event.target.value)} required type="email" value={inviteEmail} />
                    </label>
                    <label>
                      Role
                      <select onChange={(event) => setInviteRole(event.target.value as AssignableRole)} value={inviteRole}>
                        {roles.filter((role) => team.myRole === 'OWNER' || role !== 'ADMIN').map((role) => (
                          <option key={role} value={role}>{displayRole(role)}</option>
                        ))}
                      </select>
                    </label>
                    <button className="button button-primary" disabled={busy} type="submit"><Plus size={16} /> Create invite link</button>
                  </form>
                  {issuedInvitation && (
                    <div
                      className={`issued-invitation${issuedInvitation.emailStatus === 'FAILED' ? ' alert-error' : ''}`}
                      role={issuedInvitation.emailStatus === 'FAILED' ? 'alert' : 'status'}
                    >
                      <p>
                        {invitationEmailStatusLabel(issuedInvitation.emailStatus)}.
                        {' '}Share this one-time link only with <strong>{issuedInvitation.email}</strong>.
                        {' '}It will not be shown again.
                      </p>
                      <div className="issued-invitation-link">
                        <code>{issuedInvitation.inviteUrl}</code>
                        <button className="button button-secondary" onClick={() => void copyInvitation()} type="button"><Copy size={15} /> Copy link</button>
                      </div>
                    </div>
                  )}
                </section>
                {team.invitations.length > 0 && (
                  <section className="surface-card">
                    <div className="card-heading"><div><h2>Pending invitations</h2><p className="muted">Expired, accepted, and revoked invitations are not listed.</p></div></div>
                    <div className="team-member-list">
                      {team.invitations.map((invitation) => (
                        <div className="team-member-row" key={invitation.id}>
                          <div className="team-member-copy">
                            <strong>{invitation.email}</strong>
                            <span>
                              {displayRole(invitation.role)} · Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                              {' · '}{invitationEmailStatusLabel(invitation.emailStatus)}
                            </span>
                          </div>
                          <button className="button button-secondary" disabled={busy} onClick={() => void revokeInvitation(invitation)} type="button">Revoke</button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="surface-card team-empty-panel">
            <span className="empty-icon"><Users size={22} /></span>
            <h2>Select or create a team</h2>
            <p>Team projects are visible to members. Viewers are read-only; administrators and developers can work with projects.</p>
          </div>
        )}
      </div>
    </section>
  );
}
