import { useEffect, useRef, useState } from "react";
import "./GroupComponents.css";
import { groupAvatarText } from "./groupService";

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
  onOpenGroup,
  onDeleteGroup,
  onCreateGroup,
  onOpenScanner,
  isGroupAdmin,
  groupReadAt = {},
  currentUserId = "",
  onSearchActiveChange,
}) {
  const hasGroups = groups.length > 0;
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [searchText, setSearchText] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [groupsViewMode, setGroupsViewMode] = useState("mine");
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);
  const searchInputRef = useRef(null);
  const normalizedSearch = searchText.trim().toLowerCase();
  // Active the instant the field is focused (not only once text is typed) so
  // the "search mode" layout (nav hidden, hero collapsed) appears immediately
  // on tap, skipping the frame where the keyboard is open but the layout
  // hasn't switched yet.
  const searchActive = isSearchFocused || Boolean(normalizedSearch);

  useEffect(() => {
    onSearchActiveChange?.(searchActive);
    return () => onSearchActiveChange?.(false);
  }, [onSearchActiveChange, searchActive]);

  // Fully leaves search mode: clears the text, drops focus state (so the
  // nav bar and hero controls come back), and blurs the input to dismiss
  // the keyboard — mirrors the WhatsApp back-arrow behavior.
  const exitSearch = () => {
    setSearchText("");
    setIsSearchFocused(false);
    searchInputRef.current?.blur();
  };

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
    ? groups.filter(group => {
        try {
          return (group.name?.toLowerCase().includes(normalizedSearch) || false)
            || (group.desc?.toLowerCase().includes(normalizedSearch) || false)
            || (groupTypes[group.type]?.toLowerCase().includes(normalizedSearch) || false);
        } catch (err) {
          console.error("Group filter error:", err);
          return false;
        }
      })
    : groups;
  const recentGroups = filteredGroups.filter(group => {
    try {
      const activityTime = group.activityAt?.toMillis?.() || group.activityAt?.getTime?.() || 0;
      return group.lastActivityByUid !== currentUserId
        && activityTime > 0
        && activityTime > (groupReadAt[group.id] || 0);
    } catch (err) {
      console.error("Recent group filter error:", err);
      return false;
    }
  });

  return (
    <div className={`groups-page ${searchActive ? "groups-searching" : ""}`}>
      <div className="groups-hero">
        <div className="groups-topbar">
          <h2>Kampasika</h2>
          <button className="groups-camera-btn" type="button" aria-label="Scan group QR" onClick={onOpenScanner}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 8a2 2 0 0 1 2-2h2l1.3-2h5.4L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12.5" r="3.5" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>
        <div className="groups-search">
          {searchActive ? (
            <button
              className="groups-search-back"
              type="button"
              aria-label="Close search"
              onMouseDown={event => event.preventDefault()}
              onClick={exitSearch}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          <input
            ref={searchInputRef}
            type="search"
            value={searchText}
            onChange={event => setSearchText(event.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            placeholder="Search my groups..."
          />
          {searchActive && (
            <button
              className="groups-search-clear"
              type="button"
              aria-label="Clear group search"
              // onMouseDown (not onClick) fires before the input's onBlur,
              // so we can clear the text and keep focus/search-mode intact
              // instead of the layout flashing back to the non-search state.
              onMouseDown={event => event.preventDefault()}
              onClick={() => setSearchText("")}
            >
              ×
            </button>
          )}
        </div>
        {!searchActive && (
          <>
            <div className="group-actions">
              <button className="group-btn primary" type="button" onClick={onCreateGroup}>Create Group</button>
              <button className="group-btn secondary" type="button" onClick={onOpenScanner}>Scan / Join</button>
            </div>
            <div className="groups-mode-grid" aria-label="Kampasika overview">
              <button type="button" className={`groups-mode-card ${groupsViewMode === "mine" ? "active" : ""}`} onClick={() => setGroupsViewMode("mine")}>
                <strong>My Groups</strong>
                <span>{filteredGroups.length} joined</span>
              </button>
              <button type="button" className={`groups-mode-card ${groupsViewMode === "recent" ? "active" : ""}`} onClick={() => setGroupsViewMode("recent")}>
                <strong>Recent Updates</strong>
                <span>{recentGroups.length} new</span>
              </button>
            </div>
          </>
        )}
      </div>

      {!searchActive && groupsViewMode === "recent" ? (
      <div className="group-section">
        <div className="group-section-title">Recent updates</div>
        {recentGroups.length > 0 ? (
          recentGroups.map(group => (
            <button key={group.id} type="button" className="group-card" onClick={() => handleGroupOpen(group)}>
              <div className="group-avatar" style={{ backgroundImage: group.avatarUrl ? `url(${group.avatarUrl})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}>
                {!group.avatarUrl && (group.avatarText || groupAvatarText(group.name))}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="group-card-title">{group.name}</div>
                <div className="group-card-subtitle">New activity in this group</div>
              </div>
              <span className="group-new-pill">New</span>
            </button>
          ))
        ) : (
          <div className="group-empty">No recent updates. You're all caught up.</div>
        )}
      </div>
      ) : (

      <div className="group-section">
        <div className="group-section-title">My Groups</div>
        {filteredGroups.length > 0 ? (
          filteredGroups.map(group => {
            const isSelected = selectedGroupId === group.id;
            return (
              <div key={group.id} className={`group-card-wrap${isSelected ? " has-selection" : ""}`}>
                {isSelected && canDeleteGroup(group) && (
                  <div className="group-selection-bar" role="toolbar" aria-label={`Actions for ${group.name}`}>
                    <div>
                      <button type="button" className="group-btn ghost" onClick={() => { onDeleteGroup?.(group, "archive"); setSelectedGroupId(""); }}>Archive</button>
                      <button type="button" className="group-btn danger" onClick={() => { onDeleteGroup?.(group, "delete"); setSelectedGroupId(""); }}>Delete</button>
                      <button type="button" className="group-btn ghost" onClick={() => setSelectedGroupId("")}>Cancel</button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className={`group-card ${isSelected ? "selected" : ""}`}
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
                      {(group.memberCount || 0).toLocaleString()} members - {groupTypes[group.type] || "Group"}
                      {group.desc ? ` - ${group.desc}` : ""}
                    </div>
                  </div>
                  {group.lastActivityByUid !== currentUserId && group.activityAt?.toMillis && group.activityAt.toMillis() > (groupReadAt[group.id] || 0) && <span className="group-new-pill">New</span>}
                  <span className="group-visibility-pill">
                    {group.joinPolicy === "approvalRequired" ? "Approval" : "Invite"}
                  </span>
                  {isGroupAdmin(group) && <span className="group-role-pill">Admin</span>}
                </button>
              </div>
            );
          })
        ) : (
          <div className="group-empty">
            {hasGroups ? "No groups match your search." : "No groups yet. Create one or scan a group QR to join."}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

export function CreateGroupModal({ data, onChange, onClose, onCreate, uploading }) {
  const [showMembers, setShowMembers] = useState(false);
  const [showMore, setShowMore] = useState(false);
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

        <button className="group-option-row" type="button" onClick={() => setShowMembers(value => !value)}>
          <span>Add members</span>
          <strong>{showMembers ? "Hide" : "Open"}</strong>
        </button>
        {showMembers && (
          <div className="group-create-note">
            Create the group first, then share the invite link or approve members from the Members tab.
          </div>
        )}

        <button className="group-option-row" type="button" onClick={() => setShowMore(value => !value)}>
          <span>More</span>
          <strong>{showMore ? "Hide" : "Open"}</strong>
        </button>
        {showMore && (
          <>
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
              <select value={data.visibility || "inviteOnly"} onChange={event => onChange({ ...data, visibility: event.target.value })}>
                <option value="inviteOnly">Invite only - link holders can join</option>
                <option value="approvalRequired">Approval required - admins approve requests</option>
              </select>
            </div>
          </>
        )}
        <button className="group-btn primary" type="button" disabled={uploading || !data.name.trim()} style={{ width: "100%" }} onClick={onCreate}>
          {uploading ? "Creating..." : "Create Group"}
        </button>
      </div>
    </div>
  );
}
