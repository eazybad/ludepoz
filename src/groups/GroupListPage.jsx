import { useRef, useState } from "react";
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
  onOpenScanner,
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
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [searchText, setSearchText] = useState("");
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);
  const normalizedSearch = searchText.trim().toLowerCase();

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
      setSelectedGroupId(group.id);
    }, 650);
  };

  const handleGroupOpen = (group) => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (selectedGroupId) {
      setSelectedGroupId(selectedGroupId === group.id ? "" : group.id);
      return;
    }
    onOpenGroup(group);
  };

  const filteredGroups = normalizedSearch
    ? groups.filter(group => (
      group.name?.toLowerCase().includes(normalizedSearch)
      || group.desc?.toLowerCase().includes(normalizedSearch)
      || groupTypes[group.type]?.toLowerCase().includes(normalizedSearch)
    ))
    : groups;
  const filteredPublicEvents = normalizedSearch
    ? publicEvents.filter(eventItem => (
      eventItem.title?.toLowerCase().includes(normalizedSearch)
      || eventItem.description?.toLowerCase().includes(normalizedSearch)
    ))
    : publicEvents;
  const selectedGroup = groups.find(group => group.id === selectedGroupId);

  return (
    <div className="groups-page">
      <div className="groups-hero">
        <div className="groups-topbar">
          <h2>Groups</h2>
          <button className="groups-camera-btn" type="button" aria-label="Scan group QR" onClick={onOpenScanner}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 8a2 2 0 0 1 2-2h2l1.3-2h5.4L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12.5" r="3.5" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>
        <div className="groups-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={searchText}
            onChange={event => setSearchText(event.target.value)}
            placeholder="Search groups, events..."
          />
        </div>
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

      {filteredPublicEvents.length > 0 && (
        <div className="group-section">
          <div className="group-section-title">Public events</div>
          {filteredPublicEvents.map(eventItem => (
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
        {selectedGroup && canDeleteGroup(selectedGroup) && (
          <div className="group-selection-bar">
            <strong>{selectedGroup.name}</strong>
            <div>
              <button type="button" className="group-btn ghost" onClick={() => { onDeleteGroup?.(selectedGroup, "archive"); setSelectedGroupId(""); }}>Archive</button>
              <button type="button" className="group-btn danger" onClick={() => { onDeleteGroup?.(selectedGroup, "delete"); setSelectedGroupId(""); }}>Delete</button>
              <button type="button" className="group-btn ghost" onClick={() => setSelectedGroupId("")}>Cancel</button>
            </div>
          </div>
        )}
        {filteredGroups.length > 0 ? (
          filteredGroups.map(group => (
            <button
              key={group.id}
              type="button"
              className={`group-card ${selectedGroupId === group.id ? "selected" : ""}`}
              onClick={() => handleGroupOpen(group)}
              onContextMenu={event => {
                if (!canDeleteGroup(group)) return;
                event.preventDefault();
                setSelectedGroupId(group.id);
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
              {isGroupAdmin(group) && <span className="group-role-pill">Admin</span>}
            </button>
          ))
        ) : (
          <div className="group-empty">
            {hasGroups ? "No groups match your search." : `No groups yet. Start with one of the demo groups: ${DEMO_GROUPS.map(g => g.name).join(", ")}.`}
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
