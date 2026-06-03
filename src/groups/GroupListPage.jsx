import { useRef } from "react";
import "./GroupComponents.css";
import { DEMO_GROUPS, groupAvatarText } from "./groupService";

const groupTypes = {
  class: "Class",
  church: "Faith",
  club: "Club",
  hostel: "Hostel",
  freshers: "Freshers",
  other: "Group",
};

export function GroupListPage({
  groups,
  publicEvents = [],
  legacyCollections,
  onOpenGroup,
  onDeleteGroup,
  onCreateGroup,
  onCreateCollection,
  onSeedDemoGroups,
  onOpenLegacyCommunity,
  onOpenPublicEvent,
  isGroupAdmin,
  canSeedDemoGroups,
  seedingDemo,
  groupReadAt = {},
  currentUserId = "",
}) {
  const hasGroups = groups.length > 0;
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const canDeleteGroup = (group) => (
    currentUserId
    && (group.ownerUid === currentUserId || group.adminUid === currentUserId)
  );

  const startGroupLongPress = (group) => {
    longPressTriggered.current = false;
    clearLongPress();
    if (!canDeleteGroup(group)) return;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      onDeleteGroup?.(group);
    }, 650);
  };

  const handleGroupOpen = (group) => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    onOpenGroup(group);
  };

  return (
    <div className="groups-page">
      <div className="groups-hero">
        <h2>Groups</h2>
        <div className="group-actions">
          <button className="group-btn primary" type="button" onClick={onCreateGroup}>Create Group</button>
          <button className="group-btn secondary" type="button" onClick={onCreateCollection}>Create order / event</button>
          {canSeedDemoGroups && (
            <button className="group-btn ghost" type="button" disabled={seedingDemo} onClick={onSeedDemoGroups}>
              {seedingDemo ? "Adding..." : "Add demo groups"}
            </button>
          )}
        </div>
      </div>

      {publicEvents.length > 0 && (
        <div className="group-section">
          <div className="group-section-title">Public events</div>
          {publicEvents.map(eventItem => (
            <button key={`${eventItem.groupId}-${eventItem.id}`} type="button" className="group-card" onClick={() => onOpenPublicEvent(eventItem)}>
              <div className="group-avatar" style={{ borderRadius: 8 }}>EV</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="group-card-title">{eventItem.title}</div>
                <div className="group-card-subtitle">
                  {eventItem.description || "Public group event"}
                  {eventItem.amount ? ` · ${Number(eventItem.amount).toLocaleString()} TSh` : ""}
                </div>
              </div>
              <span className="group-role-pill">Register</span>
            </button>
          ))}
        </div>
      )}

      <div className="group-section">
        <div className="group-section-title">Groups</div>
        {hasGroups ? (
          groups.map(group => (
            <button
              key={group.id}
              type="button"
              className="group-card"
              onClick={() => handleGroupOpen(group)}
              onContextMenu={event => {
                if (!canDeleteGroup(group)) return;
                event.preventDefault();
                onDeleteGroup?.(group);
              }}
              onMouseDown={() => startGroupLongPress(group)}
              onMouseUp={clearLongPress}
              onMouseLeave={clearLongPress}
              onTouchStart={() => startGroupLongPress(group)}
              onTouchEnd={clearLongPress}
              onTouchCancel={clearLongPress}
            >
              <div
                className="group-avatar"
                style={{
                  backgroundImage: group.avatarUrl ? `url(${group.avatarUrl})` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {!group.avatarUrl && (group.avatarText || groupAvatarText(group.name))}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="group-card-title">{group.name}</div>
                <div className="group-card-subtitle">
                  {(group.memberCount || 0).toLocaleString()} members · {groupTypes[group.type] || "Group"}
                  {group.desc ? ` · ${group.desc}` : ""}
                </div>
              </div>
              {group.lastActivityByUid !== currentUserId && group.activityAt?.toMillis && group.activityAt.toMillis() > (groupReadAt[group.id] || 0) && <span className="group-new-pill">New</span>}
              {canDeleteGroup(group) ? <span className="group-role-pill">Hold to delete</span> : isGroupAdmin(group) && <span className="group-role-pill">Admin</span>}
            </button>
          ))
        ) : (
          <div className="group-empty">
            No groups yet. Start with one of the demo groups: {DEMO_GROUPS.map(g => g.name).join(", ")}.
          </div>
        )}
      </div>

      {legacyCollections.length > 0 && (
        <div className="group-section">
          <div className="group-section-title">Legacy orders and events</div>
          {Object.values(legacyCollections.reduce((acc, item) => {
            const key = (item.communityName || item.universityName || "General").trim();
            if (!acc[key]) acc[key] = { name: key, items: [], orders: 0, events: 0 };
            acc[key].items.push(item);
            if ((item.collectionType || "order") === "event") acc[key].events += 1;
            else acc[key].orders += 1;
            return acc;
          }, {})).sort((a, b) => b.items.length - a.items.length).map(group => (
            <button key={group.name} type="button" className="group-card" onClick={() => onOpenLegacyCommunity(group)}>
              <div className="group-avatar" style={{ borderRadius: 8, background: "#0d9488" }}>
                {groupAvatarText(group.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="group-card-title">{group.name}</div>
                <div className="group-card-subtitle">{group.orders} orders · {group.events} events · {group.items.length} total</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CreateGroupModal({ data, onChange, onClose, onCreate, uploading }) {
  const typeOptions = [
    ["class", "Class / Year"],
    ["church", "Faith group"],
    ["club", "Club"],
    ["hostel", "Hostel"],
    ["freshers", "Freshers"],
    ["other", "Other"],
  ];

  return (
    <div className="group-modal-backdrop" onClick={onClose}>
      <div className="group-modal" onClick={event => event.stopPropagation()}>
        <h3>Create a Group</h3>
        <div className="group-field">
          <label>Group name</label>
          <input
            type="text"
            placeholder="Architecture Year 2"
            value={data.name}
            onChange={event => onChange({ ...data, name: event.target.value })}
          />
        </div>
        <div className="group-field">
          <label>Description</label>
          <input
            type="text"
            placeholder="Announcements, payments, resources..."
            value={data.desc}
            onChange={event => onChange({ ...data, desc: event.target.value })}
          />
        </div>
        <div className="group-field">
          <label>Group type</label>
          <div className="group-choice-row">
            {typeOptions.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`group-choice ${data.type === id ? "active" : ""}`}
                onClick={() => onChange({ ...data, type: id })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="group-field">
          <label>Who can join?</label>
          <select value={data.visibility || "public"} onChange={event => onChange({ ...data, visibility: event.target.value })}>
            <option value="public">Public - students can discover and join</option>
            <option value="inviteOnly">Invite only - link holders can join</option>
            <option value="approvalRequired">Approval required - admins approve requests</option>
          </select>
        </div>
        <button className="group-btn primary" type="button" disabled={uploading || !data.name.trim()} style={{ width: "100%" }} onClick={onCreate}>
          {uploading ? "Creating..." : "Create Group"}
        </button>
      </div>
    </div>
  );
}
