// ─── Statement: every rent payment the owner has received ───
// A record of payments made straight to the owner (online into their own
// account, paid to their number and confirmed, or recorded by them as cash /
// bank). Kampasika keeps the record; it never holds the money.
// Filter by month, then export to CSV (opens in Excel / Google Sheets) or print.

import { useMemo, useState } from "react";
import { t } from "./bizCopy";

const tzs = (n) => `TZS ${Math.round(Number(n || 0)).toLocaleString("en-US")}`;

function sourceOf(p) {
  if (p.depositId || String(p.method || "").startsWith("pawapay")) return "online";
  if (p.direct) return "confirmed";
  return "recorded";
}

function monthLabel(key, lang) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-GB", { month: "long", year: "numeric" });
}

function fmtDay(iso, lang) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function paymentsFromCharges(charges) {
  const rows = [];
  (charges || []).forEach(c => (c.payments || []).forEach((p, i) => {
    const day = String(p.paidOn || p.at || "").slice(0, 10);
    rows.push({
      key: `${c.id}-${i}`,
      day,
      tenant: c.tenantName || "",
      room: c.roomLabel || "",
      label: c.label || "",
      method: p.method || "",
      reference: p.reference || "",
      amount: Number(p.amount || 0),
      source: sourceOf(p),
    });
  }));
  return rows.sort((a, b) => b.day.localeCompare(a.day));
}

export function Statement({ operator, lang, charges }) {
  const all = useMemo(() => paymentsFromCharges(charges), [charges]);
  const months = useMemo(() => [...new Set(all.map(r => r.day.slice(0, 7)).filter(Boolean))].sort().reverse(), [all]);
  const [month, setMonth] = useState("all");
  const rows = month === "all" ? all : all.filter(r => r.day.startsWith(month));

  const totals = useMemo(() => {
    const by = { online: 0, confirmed: 0, recorded: 0 };
    rows.forEach(r => { by[r.source] += r.amount; });
    return { total: rows.reduce((s, r) => s + r.amount, 0), ...by };
  }, [rows]);

  const methodText = (m) => {
    const label = t(lang, `methods.${m}`);
    return label && !label.startsWith("methods.") ? label : m;
  };

  const exportCsv = () => {
    const header = [
      t(lang, "stmtDate"), t(lang, "stmtTenant"), t(lang, "stmtRoom"), t(lang, "stmtFor"),
      t(lang, "stmtMethod"), t(lang, "stmtHow"), t(lang, "stmtReference"), t(lang, "stmtAmount"),
    ];
    const lines = [header, ...rows.map(r => [
      r.day, r.tenant, r.room, r.label, methodText(r.method), t(lang, `stmtSource.${r.source}`), r.reference, r.amount,
    ])].map(cols => cols.map(csvCell).join(","));
    const name = String(operator?.profile?.businessName || "kampasika").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kampasika";
    // BOM so Excel reads Kiswahili / special characters correctly.
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-statement-${month === "all" ? "all" : month}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <div className="stmt-head">
        <div>
          <h1 className="biz-h1">{t(lang, "stmtTitle")}</h1>
          <p className="biz-muted">{operator?.profile?.businessName} · {t(lang, "stmtIntro")}</p>
        </div>
        <div className="stmt-actions biz-noprint">
          <select className="biz-input stmt-month" value={month} onChange={e => setMonth(e.target.value)} aria-label={t(lang, "stmtMonth")}>
            <option value="all">{t(lang, "stmtAllTime")}</option>
            {months.map(m => <option key={m} value={m}>{monthLabel(m, lang)}</option>)}
          </select>
          <button type="button" className="biz-btn ghost small" disabled={!rows.length} onClick={() => window.print()}>🖨 {t(lang, "stmtPrint")}</button>
          <button type="button" className="biz-btn primary small" disabled={!rows.length} onClick={exportCsv}>⬇ {t(lang, "stmtExport")}</button>
        </div>
      </div>

      <div className="biz-tiles">
        <div className="biz-tile"><span>{t(lang, "stmtTotal")}</span><strong>{tzs(totals.total)}</strong></div>
        <div className="biz-tile"><span>{t(lang, "stmtCount")}</span><strong>{rows.length}</strong></div>
        <div className="biz-tile"><span>{t(lang, "stmtSource.confirmed")}</span><strong>{tzs(totals.confirmed)}</strong></div>
        <div className="biz-tile"><span>{t(lang, "stmtSource.recorded")}</span><strong>{tzs(totals.recorded)}</strong></div>
        {totals.online > 0 && <div className="biz-tile"><span>{t(lang, "stmtSource.online")}</span><strong>{tzs(totals.online)}</strong></div>}
      </div>

      {charges === null && <div className="biz-center"><div><div className="biz-spinner" />{t(lang, "loading")}</div></div>}
      {charges && rows.length === 0 && <div className="biz-card"><p className="biz-muted">{t(lang, "stmtEmpty")}</p></div>}

      {rows.length > 0 && (
        <div className="biz-card stmt-card">
          <table className="stmt-table">
            <thead>
              <tr>
                <th>{t(lang, "stmtDate")}</th>
                <th>{t(lang, "stmtTenant")}</th>
                <th>{t(lang, "stmtFor")}</th>
                <th>{t(lang, "stmtMethod")}</th>
                <th>{t(lang, "stmtReference")}</th>
                <th className="num">{t(lang, "stmtAmount")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key}>
                  <td data-label={t(lang, "stmtDate")} className="stmt-day">{fmtDay(r.day, lang)}</td>
                  <td data-label={t(lang, "stmtTenant")}><strong>{r.tenant || "—"}</strong>{r.room && <span className="biz-small stmt-sub">{r.room}</span>}</td>
                  <td data-label={t(lang, "stmtFor")}>{r.label || "—"}</td>
                  <td data-label={t(lang, "stmtMethod")}>
                    {methodText(r.method)}
                    <span className={`stmt-src ${r.source}`}>{t(lang, `stmtSource.${r.source}`)}</span>
                  </td>
                  <td data-label={t(lang, "stmtReference")} className="stmt-ref">{r.reference || "—"}</td>
                  <td data-label={t(lang, "stmtAmount")} className="num"><strong>{tzs(r.amount)}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>{t(lang, "stmtTotal")}</td>
                <td className="num"><strong>{tzs(totals.total)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="biz-small" style={{ marginTop: 12 }}>{t(lang, "stmtNote")}</p>
    </>
  );
}
