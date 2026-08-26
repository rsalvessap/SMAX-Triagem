// ==UserScript==
// @name         SMAX Triagem ADM - TJSP
// @namespace    https://github.com/rsalvessap/SMAX-Triagem
// @version      1.1
// @description  [ADM] Módulo de triagem para o SMAX TJSP — versão de desenvolvimento
// @author       rsalvessap
// @match        https://suporte.tjsp.jus.br/saw/*
// @match        https://eproc1g.tjsp.jus.br/eproc/controlador.php*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// @connect      rlcbmrjkojopipiwpktf.supabase.co
// @noframes
// @downloadURL  https://github.com/rsalvessap/SMAX-Triagem/raw/refs/heads/master/SMAX/SMAX%20Triagem%20ADM%20-%20TJSP.user.js
// @updateURL    https://github.com/rsalvessap/SMAX-Triagem/raw/refs/heads/master/SMAX/SMAX%20Triagem%20ADM%20-%20TJSP.user.js
// @homepageURL  https://github.com/rsalvessap/SMAX-Triagem
// @supportURL   https://github.com/rsalvessap/SMAX-Triagem/issues
// ==/UserScript==

(() => {
  'use strict';

  if (window.top && window.top !== window.self) return;

  // Código SMAX roda apenas no domínio do SMAX
  if (window.location.hostname !== 'suporte.tjsp.jus.br') return;

  /* Supabase — Gerenciador de Chamados (chave pública exposta no bundle do app) */
  const SMAX_SB_URL = 'https://rlcbmrjkojopipiwpktf.supabase.co';
  const SMAX_SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsY2Jtcmprb2pvcGlwaXdwa3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MzI0MTksImV4cCI6MjA5NDMwODQxOX0.Ha4xRbFvbgb2yO64ga3dV8KrNGRgbV7zWFXc5bYHdeQ';

  const SMAX_TOOLKIT_VERSION = '1.1';
  const SMAX_TENANT_ID = '213963628';
  console.log('%c[SMAX Triagem ADM] v' + SMAX_TOOLKIT_VERSION + ' carregado', 'color:#f59e0b;font-weight:bold;font-size:13px;');

  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const getPageCKEditor = () => (pageWindow && pageWindow.CKEDITOR ? pageWindow.CKEDITOR : null);

  /* =========================================================
   * Preferences
   * =======================================================*/
  const PrefStore = (() => {
    const defaults = {
      nameGroups: {},
      ausentes: [],
      enableRealWrites: true,
      defaultGlobalChangeId: '',
      personalFinalsRaw: '',
      myPersonId: '',
      myPersonName: '',
      sharedConfigUrl: 'https://raw.githubusercontent.com/rsalvessap/SMAX-TOOLS/master/shared-config.json',
      githubToken: '',
      teamsConfigRaw: JSON.stringify([
        {
          id: 'jec',
          name: 'JEC / JUIZADO',
          priority: 10,
          matchers: [

          ],
          workers: []
        },
        {
          id: 'geral',
          name: 'GERAL',
          priority: 1,
          isDefault: true,
          matchers: [],
          workers: []
        }
      ]),
      teamSignaturesRaw: '{}',
      ackMessageTemplate: 'Prezado(a) Solicitante,\nInformamos que a solicitação foi recebida e está sendo analisada com a devida prioridade.\nAs atualizações serão comunicadas por este canal.',
    };

    const state = JSON.parse(JSON.stringify(defaults));

    const load = () => {
      try {
        const saved = GM_getValue('smax_prefs');
        if (!saved) return;
        const parsed = JSON.parse(saved);
        Object.assign(state, defaults, parsed || {});
        // Migrar ackMessageTemplate de HTML para texto puro (versões ≤2.90)
        if (state.ackMessageTemplate && /<[^>]+>/.test(state.ackMessageTemplate)) {
          state.ackMessageTemplate = state.ackMessageTemplate
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/\{nome\}/gi, 'Solicitante')
            .trim();
        }
        console.log('[SMAX] Preferences loaded:', state);
      } catch (err) {
        console.warn('[SMAX] Failed to load preferences:', err);
      }
    };

    const save = () => {
      try {
        GM_setValue('smax_prefs', JSON.stringify(state));
        console.log('[SMAX] Preferences saved:', state);
      } catch (err) {
        console.error('[SMAX] Failed to save preferences:', err);
      }
    };

    load();
    return { state, save, defaults };
  })();

  const prefs = PrefStore.state;
  const savePrefs = PrefStore.save;

  /* =========================================================
   * PersonalStore — configurações pessoais (não compartilhadas)
   * Cada usuário tem seus próprios valores; não entra no export
   * de config da equipe (CONFIG_KEYS).
   * =======================================================*/
  const PersonalStore = (() => {
    const STORAGE_KEY = 'smax_personal_prefs';
    const defaults = {
      themeMode:   'dark', // 'dark' | 'light'
      personalSignatures: [],  // [{ name: string, html: string }]
    };

    const state = JSON.parse(JSON.stringify(defaults));

    const load = () => {
      try {
        const saved = GM_getValue(STORAGE_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved);
        Object.assign(state, defaults, parsed || {});
      } catch (err) {
        console.warn('[SMAX] PersonalStore load error:', err);
      }
    };

    const save = () => {
      try { GM_setValue(STORAGE_KEY, JSON.stringify(state)); }
      catch (err) { console.error('[SMAX] PersonalStore save error:', err); }
    };

    load();
    return { state, save };
  })();

  const personal     = PersonalStore.state;
  const savePersonal = PersonalStore.save;

  /* =========================================================
   * SignatureManager — assinaturas configuráveis por equipe e pessoais
   * =======================================================*/
  const SignatureManager = {
    getTeamSignatures() {
      try { return JSON.parse(prefs.teamSignaturesRaw || '{}'); } catch { return {}; }
    },
    saveTeamSignatures(obj) {
      prefs.teamSignaturesRaw = JSON.stringify(obj || {});
      PrefStore.save();
    },
    getPersonalSignatures() {
      return Array.isArray(personal.personalSignatures) ? personal.personalSignatures : [];
    },
    savePersonalSignatures(arr) {
      personal.personalSignatures = arr;
      savePersonal();
    },
    buildSignatureList() {
      const list = [];
      const teamSigs = this.getTeamSignatures();
      // TeamsConfig pode não estar disponível ainda — guard
      const allTeams = (typeof TeamsConfig !== 'undefined' && TeamsConfig.getTeams) ? TeamsConfig.getTeams() : [];
      allTeams.forEach(t => {
        const html = teamSigs[t.id];
        if (html && html.trim()) list.push({ label: t.name || t.id, html, source: 'team' });
      });
      this.getPersonalSignatures().forEach(s => {
        if (s.html && s.html.trim()) list.push({ label: s.name || 'Assinatura pessoal', html: s.html, source: 'personal' });
      });
      return list;
    },
    _ensureBr(html) {
      if (!/<(p|br|div|li|ul|ol|h[1-6])\b/i.test(html)) return html.replace(/\n/g, '<br>');
      return html;
    },
    appendToContenteditable(editor, sigHtml) {
      if (!editor || !sigHtml) return;
      sigHtml = this._ensureBr(sigHtml);
      const sigText = sigHtml.replace(/<[^>]+>/g, '').trim().slice(0, 60);
      if (sigText && (editor.textContent || '').includes(sigText)) return;
      editor.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertHTML', false, sigHtml);
    },
    appendToCKEditor(instance, sigHtml) {
      if (!instance || !sigHtml) return;
      sigHtml = this._ensureBr(sigHtml);
      const current = instance.getData() || '';
      const sigText = sigHtml.replace(/<[^>]+>/g, '').trim().slice(0, 60);
      if (sigText && current.includes(sigText)) return;
      instance.setData(current + sigHtml);
    }
  };

  /* =========================================================
   * ThemeManager — light / dark mode
   * =======================================================*/
  const ThemeManager = (() => {
    const MODES = ['dark', 'gray', 'light'];
    const ICONS  = { dark: '☀️', gray: '🌓', light: '🌙' };
    const TITLES = { dark: 'Mudar para modo cinza', gray: 'Mudar para modo claro', light: 'Mudar para modo escuro' };
    const apply = (mode) => {
      const m = MODES.includes(mode) ? mode : 'dark';
      document.documentElement.dataset.smaxTheme = m;
      document.body.dataset.smaxTheme = m;
      personal.themeMode = m;
      savePersonal();
      const btn = document.getElementById('smax-theme-toggle-btn');
      if (btn) {
        btn.textContent = ICONS[m];
        btn.title = TITLES[m];
      }
      document.querySelectorAll('#smax-theme-toggle-hud').forEach(b => {
        b.textContent = ICONS[m];
      });
    };
    const toggle = () => {
      const idx = MODES.indexOf(personal.themeMode);
      apply(MODES[(idx + 1) % MODES.length]);
    };
    const init = () => apply(MODES.includes(personal.themeMode) ? personal.themeMode : 'dark');
    return { apply, toggle, init };
  })();

  /* =========================================================
   * Activity Log (persistent workload tracking)
   * =======================================================*/
  const ActivityLog = (() => {
    const STORAGE_KEY = 'smax_activity_log';
    const MAX_ENTRIES = 5000;
    let entries = [];
    let syncFailCount = 0;

    const load = () => {
      try {
        const saved = GM_getValue(STORAGE_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          entries = parsed;
          console.log('[SMAX] Activity log loaded:', entries.length, 'entries');
        }
      } catch (err) {
        console.warn('[SMAX] Failed to load activity log:', err);
      }
    };

    const save = () => {
      try {
        // Auto-prune oldest entries if over limit
        if (entries.length > MAX_ENTRIES) {
          entries = entries.slice(entries.length - MAX_ENTRIES);
        }
        GM_setValue(STORAGE_KEY, JSON.stringify(entries));
      } catch (err) {
        console.error('[SMAX] Failed to save activity log:', err);
      }
    };

    // ── Supabase sync ──────────────────────────────────────────
    const SB_WRITE_HEADERS = {
      apikey:          SMAX_SB_KEY,
      Authorization:   `Bearer ${SMAX_SB_KEY}`,
      'Content-Type':  'application/json',
      'Accept-Profile':'public',
      'Prefer':        'return=minimal,resolution=ignore-duplicates',
    };
    const SB_READ_HEADERS = {
      apikey:          SMAX_SB_KEY,
      Authorization:   `Bearer ${SMAX_SB_KEY}`,
      'Accept-Profile':'public',
    };

    let _sbHasTicketSubject = true; // assume coluna existe; desativa se 400
    const syncToSupabase = (entry) => {
      try {
        const equipeId = GM_getValue('smax_gerenciador_equipe_id', null);
        const row = {
          ts:               entry.ts,
          ticket_id:        entry.ticketId,
          relevant_work:    entry.relevantWork  || null,
          answered:         !!entry.answered,
          assigned:         !!entry.assigned,
          assigned_to:      entry.assignedTo    || null,
          global_assigned:  !!entry.globalAssigned,
          global_change_id: entry.globalChangeId || null,
          transferred:      !!entry.transferred,
          transferred_to:   entry.transferredTo  || null,
          used_script:      !!entry.usedScript,
          user_name:        entry.user           || null,
          equipe_id:        equipeId             || null,
          success:          entry.success !== false,
        };
        if (_sbHasTicketSubject) row.ticket_subject = entry.ticketSubject || null;
        const sbWriteCtrl = new AbortController();
        const sbWriteTimer = setTimeout(() => sbWriteCtrl.abort(), 8000);
        fetch(`${SMAX_SB_URL}/rest/v1/smax_activity_log`, {
          method:  'POST',
          headers: SB_WRITE_HEADERS,
          body:    JSON.stringify(row),
          signal:  sbWriteCtrl.signal,
        }).then(resp => {
          clearTimeout(sbWriteTimer);
          if (resp && !resp.ok && resp.status === 400 && _sbHasTicketSubject) {
            // Coluna ticket_subject provavelmente não existe — retentar sem ela
            _sbHasTicketSubject = false;
            delete row.ticket_subject;
            fetch(`${SMAX_SB_URL}/rest/v1/smax_activity_log`, {
              method: 'POST', headers: SB_WRITE_HEADERS,
              body: JSON.stringify(row)
            }).catch(() => { syncFailCount++; });
          }
        }).catch(e => { clearTimeout(sbWriteTimer); syncFailCount++; console.warn('[SMAX] ActivityLog Supabase sync failed:', e); });
      } catch (e) {
        syncFailCount++;
        console.warn('[SMAX] ActivityLog syncToSupabase error:', e);
      }
    };

    const fetchFromSupabase = async (fromTs, toTs) => {
      const equipeId = GM_getValue('smax_gerenciador_equipe_id', null);
      const eqFilter = equipeId ? `&equipe_id=eq.${encodeURIComponent(equipeId)}` : '';
      const url = `${SMAX_SB_URL}/rest/v1/smax_activity_log`
        + `?ts=gte.${fromTs}&ts=lte.${toTs}&order=ts.asc&limit=10000${eqFilter}`;
      const sbReadCtrl = new AbortController();
      const sbReadTimer = setTimeout(() => sbReadCtrl.abort(), 8000);
      const resp = await fetch(url, { headers: SB_READ_HEADERS, signal: sbReadCtrl.signal });
      clearTimeout(sbReadTimer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return (data || []).map(r => ({
        ts:             r.ts,
        ticketId:       r.ticket_id,
        ticketSubject:  r.ticket_subject   || '',
        relevantWork:   r.relevant_work    || '',
        answered:       r.answered,
        assigned:       r.assigned,
        assignedTo:     r.assigned_to      || '',
        globalAssigned: r.global_assigned,
        globalChangeId: r.global_change_id || '',
        transferred:    r.transferred,
        transferredTo:  r.transferred_to   || '',
        usedScript:     r.used_script,
        user:           r.user_name        || '',
        success:        r.success,
      }));
    };
    // ──────────────────────────────────────────────────────────

    const deriveRelevantWork = (data) => {
      // Priority: RESPONDIDO > VINCULO_GLOBAL > TRANSFERIDO > DESIGNADO > STATUS > OUTRO
      if (data.answered) return 'RESPONDIDO';
      if (data.globalAssigned) return 'VINCULO_GLOBAL';
      if (data.transferred) return 'TRANSFERIDO';
      if (data.assigned) return 'DESIGNADO';
      if (data.statusSCCDChanged) return 'STATUS';
      return 'OUTRO';
    };

    const log = (data) => {
      if (!data || !data.ticketId) return;
      const entry = {
        ts: Date.now(),
        ticketId: String(data.ticketId || ''),
        ticketSubject: data.ticketSubject || DataRepository.triageCache.get(String(data.ticketId))?.subjectText || '',
        assigned: !!data.assigned,
        assignedTo: data.assignedTo || '',
        globalAssigned: !!data.globalAssigned,
        globalChangeId: data.globalChangeId || '',
        transferred: !!data.transferred,
        transferredTo: data.transferredTo || '',
        answered: !!data.answered,
        usedScript: !!data.usedScript,
        statusSCCDChanged: !!data.statusSCCDChanged,
        statusSCCDTo: data.statusSCCDTo || '',
        relevantWork: '',
        user: data.user || prefs.myPersonName || '',
        success: data.success !== false
      };
      entry.relevantWork = deriveRelevantWork(entry);
      entries.push(entry);
      save();
      syncToSupabase(entry);
      console.log('[SMAX] Activity logged:', entry);
    };

    const formatDateBrazilian = (ts) => {
      try {
        const d = new Date(ts);
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      } catch {
        return '';
      }
    };

    const escapeCSV = (value) => {
      if (value == null) return '';
      const str = String(value);
      if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const exportCsv = (filterDays = null) => {
      let toExport = entries.slice();
      if (filterDays && filterDays > 0) {
        const cutoff = Date.now() - (filterDays * 24 * 60 * 60 * 1000);
        toExport = toExport.filter((e) => e.ts >= cutoff);
      }
      if (!toExport.length) {
        alert('Nenhuma entrada para exportar.');
        return;
      }
      const headers = ['Data', 'Hora', 'Chamado', 'Assunto', 'Trabalho Relevante', 'Atribuído Para', 'Global', 'Transferido Para', 'Respondido', 'Script Utilizado', 'Usuário', 'Sucesso'];
      const rows = toExport.map((e) => {
        const fullDate = formatDateBrazilian(e.ts);
        const [datePart, timePart] = fullDate.split(' ');
        const subject = e.ticketSubject || DataRepository.triageCache.get(String(e.ticketId))?.subjectText || '';
        return [
          datePart || '',
          timePart || '',
          e.ticketId,
          subject,
          e.relevantWork,
          e.assignedTo,
          e.globalChangeId,
          e.transferredTo,
          e.answered ? 'Sim' : 'Não',
          e.usedScript ? 'Sim' : 'Não',
          e.user,
          e.success ? 'Sim' : 'Não'
        ].map(escapeCSV).join(',');
      });
      const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      triggerDownload(blob, 'triagem_log_padrao');
    };

    const triggerDownload = (blob, slug) => {
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const filename = `${slug}_${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      console.log('[SMAX] Exported CSV:', filename);
    };

    const clear = () => {
      if (!confirm('Tem certeza que deseja limpar TODO o log de atividades? Esta ação não pode ser desfeita.')) return false;
      entries = [];
      save();
      console.log('[SMAX] Activity log cleared');
      return true;
    };

    const getCount = () => entries.length;
    const getEntries = () => entries.slice();

    // Retorna Map<ticketId, globalChangeId> com o vínculo global mais recente por chamado
    const getGlobalMap = () => {
      const map = new Map();
      for (const e of entries) {
        if (e.globalAssigned && e.globalChangeId && e.ticketId) {
          map.set(String(e.ticketId), String(e.globalChangeId));
        }
      }
      return map;
    };

    load();

    const getSyncFailCount = () => syncFailCount;
    const resetSyncFailCount = () => { syncFailCount = 0; };

    return { log, exportCsv, clear, getCount, getEntries, getGlobalMap, load, fetchFromSupabase, getSyncFailCount, resetSyncFailCount };
  })();

  /* =========================================================
   * Styles
   * =======================================================*/
  GM_addStyle(`
/* ============================================================
   SMAX Toolkit — REFINO VISUAL (proposta)
   Sistema coeso: paletas unificadas por TOKEN (sem cores
   hardcoded por modulo), headers solidos cientes do tema,
   botoes/inputs/urgencia padronizados.
   Todos os seletores sao identicos ao userscript original —
   so mudam VALORES. Pronto para substituir o bloco GM_addStyle.
   ============================================================ */

/* ---------- TOKENS: LIGHT (padrao) ---------- */
:root {
  --sp-bg:#dde8f4; --sp-surface:#eef4fb; --sp-surface-2:#e3edf7; --sp-elevated:#ffffff;
  --sp-text:#14273c; --sp-text-muted:#4d6075; --sp-text-dim:#73889c;
  --sp-border:#c2d2e2; --sp-border-strong:#a6bcd2;
  --sp-accent:#0a5cc0; --sp-accent-hover:#084a9e;
  --sp-primary:#0a5cc0; --sp-primary-bg:rgba(10,92,192,.08); --sp-primary-hover:rgba(10,92,192,.14);
  --sp-sidebar-bg:#d3e1f0; --sp-sidebar-text:#2a4763; --sp-sidebar-active-bg:rgba(10,92,192,.12); --sp-sidebar-active-text:#084a9e;
  --sp-input-bg:#ffffff; --sp-input-border:#c2d2e2; --sp-input-text:#14273c;
  --sp-shadow:0 10px 34px rgba(20,40,70,.16), 0 0 0 1px rgba(20,40,70,.05) inset;
  --sp-card-bg:#ffffff;
  --sp-danger:#c0392b; --sp-danger-bg:#fdecec; --sp-danger-text:#b23427; --sp-danger-border:#e8b4ae;
  --sp-success:#15803d; --sp-success-bg:rgba(21,128,61,.10); --sp-success-text:#15803d;
  /* novos tokens compartilhados */
  --sp-header-bg:#0a5cc0; --sp-header-fg:#ffffff; --sp-header-sub:rgba(255,255,255,.78);
  --sp-header-btn:rgba(255,255,255,.16); --sp-header-btn-hover:rgba(255,255,255,.30);
  --sp-send:#15803d; --sp-send-hover:#126a33;
  --sp-ring:rgba(10,92,192,.30);
  --sp-staged:#15803d; --sp-staged-bg:rgba(21,128,61,.12);
  --sp-pending:#b45309; --sp-pending-bg:rgba(180,83,9,.12);
  --sp-on-accent:#ffffff;
  --sp-r-lg:12px; --sp-r-md:8px; --sp-r-sm:6px;
}
/* ---------- TOKENS: DARK ---------- */
[data-smax-theme="dark"] {
  --sp-bg:#0f1623; --sp-surface:#161f2e; --sp-surface-2:#1d2839; --sp-elevated:#1a2536;
  --sp-text:#e4ecf6; --sp-text-muted:#9aa7b8; --sp-text-dim:#647285;
  --sp-border:#2b3850; --sp-border-strong:#3a4a66;
  --sp-accent:#5aa6e6; --sp-accent-hover:#7cbcf0;
  --sp-primary:#5aa6e6; --sp-primary-bg:rgba(90,166,230,.12); --sp-primary-hover:rgba(90,166,230,.20);
  --sp-sidebar-bg:#0c121d; --sp-sidebar-text:#9aa7b8; --sp-sidebar-active-bg:rgba(90,166,230,.14); --sp-sidebar-active-text:#7cbcf0;
  --sp-input-bg:#131c2b; --sp-input-border:#2b3850; --sp-input-text:#e4ecf6;
  --sp-shadow:0 16px 44px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.05) inset;
  --sp-card-bg:#161f2e;
  --sp-danger:#f06b6b; --sp-danger-bg:#2a1616; --sp-danger-text:#f49a9a; --sp-danger-border:#6e2424;
  --sp-success:#46c96e; --sp-success-bg:rgba(70,201,110,.12); --sp-success-text:#74e09a;
  --sp-header-bg:#16243d; --sp-header-fg:#e9f1fb; --sp-header-sub:rgba(233,241,251,.62);
  --sp-header-btn:rgba(255,255,255,.10); --sp-header-btn-hover:rgba(255,255,255,.20);
  --sp-send:#1f9d57; --sp-send-hover:#25b364;
  --sp-ring:rgba(90,166,230,.35);
  --sp-staged:#46c96e; --sp-staged-bg:rgba(70,201,110,.14);
  --sp-pending:#e0a83c; --sp-pending-bg:rgba(224,168,60,.14);
  --sp-on-accent:#ffffff;
}
/* ---------- TOKENS: GRAY ---------- */
[data-smax-theme="gray"] {
  --sp-bg:#232323; --sp-surface:#2d2d2d; --sp-surface-2:#353535; --sp-elevated:#292929;
  --sp-text:#e9e7e4; --sp-text-muted:#9a9692; --sp-text-dim:#6f6b67;
  --sp-border:#434343; --sp-border-strong:#555555;
  --sp-accent:#d4a96a; --sp-accent-hover:#e2bc84;
  --sp-primary:#d4a96a; --sp-primary-bg:rgba(212,169,106,.12); --sp-primary-hover:rgba(212,169,106,.20);
  --sp-sidebar-bg:#1d1d1d; --sp-sidebar-text:#9a9692; --sp-sidebar-active-bg:rgba(212,169,106,.14); --sp-sidebar-active-text:#e2bc84;
  --sp-input-bg:#262626; --sp-input-border:#444444; --sp-input-text:#e9e7e4;
  --sp-shadow:0 16px 44px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.05) inset;
  --sp-card-bg:#2d2d2d;
  --sp-danger:#f06b6b; --sp-danger-bg:#2a1818; --sp-danger-text:#f49a9a; --sp-danger-border:#6b1e1e;
  --sp-success:#5bbf7e; --sp-success-bg:rgba(91,191,126,.12); --sp-success-text:#84d6a0;
  --sp-header-bg:#211f1c; --sp-header-fg:#ede6da; --sp-header-sub:rgba(237,230,218,.6);
  --sp-header-btn:rgba(255,255,255,.08); --sp-header-btn-hover:rgba(255,255,255,.16);
  --sp-send:#4f9e6b; --sp-send-hover:#5bb079;
  --sp-ring:rgba(212,169,106,.35);
  --sp-staged:#5bbf7e; --sp-staged-bg:rgba(91,191,126,.14);
  --sp-pending:#d6a44e; --sp-pending-bg:rgba(214,164,78,.14);
  --sp-on-accent:#1c1a16;
}

/* ============================================================
   TRIAGE HUD
   ============================================================ */
#smax-triage-hud-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:999997; display:none; align-items:stretch; justify-content:stretch; overflow:hidden; }
#smax-triage-hud { position:relative; width:100%; height:100%; max-width:none; max-height:none; border-radius:0; padding:0; background:var(--sp-bg); color:var(--sp-text); box-shadow:var(--sp-shadow); font-family:'Metric-Regular','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:13px; display:flex; gap:0; align-items:stretch; overflow:hidden; }
#smax-triage-hud-main { display:flex; flex-direction:column; gap:12px; flex:1; min-width:0; }

/* Header — unificado, solido, ciente do tema */
#smax-triage-hud-header { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:52px; padding:10px 20px; background:var(--sp-header-bg); color:var(--sp-header-fg); border-bottom:2px solid var(--sp-accent); border-radius:0; }
#smax-triage-hud-header .smax-triage-title-bar { display:flex; align-items:center; gap:12px; flex:1; }
.smax-triage-header-nav { display:inline-flex; align-items:center; gap:8px; margin-right:8px; }
.smax-triage-header-nav button { width:38px; height:32px; border-radius:var(--sp-r-md); border:none; background:var(--sp-header-btn); color:var(--sp-header-fg); font-weight:700; font-size:14px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .15s ease, transform .1s ease; }
.smax-triage-header-nav button:hover:not(:disabled) { background:var(--sp-header-btn-hover); transform:scale(1.05); }
.smax-triage-header-nav button:disabled { opacity:.35; cursor:not-allowed; }
#smax-triage-location-display { font-size:11px; font-weight:500; color:var(--sp-header-fg); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:default; background:var(--sp-header-btn); border-radius:var(--sp-r-sm); padding:4px 9px; }
#smax-triage-location-display[data-empty="true"] { color:var(--sp-header-sub); font-style:italic; }
#smax-personal-finals-input { background:var(--sp-input-bg); border:1px solid var(--sp-input-border); border-radius:999px; padding:3px 10px; color:var(--sp-input-text); font-size:11px; min-width:60px; max-width:70px; }
#smax-personal-finals-input::placeholder { color:var(--sp-text-muted); }

/* GSE dropdown */
#smax-triage-gse-wrapper { position:relative; min-width:220px; display:flex; flex-direction:column; gap:4px; }
#smax-triage-gse-display { width:100%; border-radius:var(--sp-r-md); border:1px solid var(--sp-input-border); background:var(--sp-input-bg); color:var(--sp-input-text); font-size:12px; min-height:32px; padding:6px 32px 6px 12px; text-align:left; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:8px; transition:border-color .15s ease, box-shadow .15s ease, background .15s ease, color .15s ease; }
#smax-triage-gse-display:disabled { opacity:.6; cursor:not-allowed; }
.smax-triage-gse-chevron { font-size:11px; color:var(--sp-text-muted); transition:transform .15s ease; }
#smax-triage-gse-wrapper[data-open="true"] .smax-triage-gse-chevron { transform:rotate(180deg); }
#smax-triage-gse-dropdown { position:absolute; top:calc(100% + 6px); right:0; width:260px; background:var(--sp-surface); border:1px solid var(--sp-border); border-radius:var(--sp-r-lg); box-shadow:var(--sp-shadow); padding:10px; display:none; flex-direction:column; gap:8px; z-index:9; }
#smax-triage-gse-wrapper[data-open="true"] #smax-triage-gse-dropdown { display:flex; }
#smax-triage-gse-filter { background:var(--sp-input-bg); border:1px solid var(--sp-input-border); border-radius:999px; padding:6px 12px; color:var(--sp-input-text); font-size:12px; transition:border-color .15s, box-shadow .15s; width:100%; box-sizing:border-box; }
#smax-triage-gse-filter::placeholder { color:var(--sp-text-muted); }
#smax-triage-gse-filter:focus { outline:none; border-color:var(--sp-accent); box-shadow:0 0 0 3px var(--sp-ring); }
.smax-triage-gse-options { max-height:240px; overflow-y:auto; display:flex; flex-direction:column; gap:4px; }
.smax-triage-gse-option { border-radius:var(--sp-r-sm); border:1px solid transparent; background:var(--sp-surface-2); color:var(--sp-text); font-size:12px; padding:7px 10px; text-align:left; cursor:pointer; transition:all .12s ease; display:flex; justify-content:space-between; align-items:center; gap:10px; }
.smax-triage-gse-option:hover { border-color:var(--sp-accent); background:var(--sp-primary-bg); }
.smax-triage-gse-option[data-active="true"] { border-color:var(--sp-staged); background:var(--sp-staged-bg); color:var(--sp-text); }
.smax-triage-gse-option[data-empty="true"] { opacity:.7; border-style:dashed; cursor:default; justify-content:center; }
.smax-triage-gse-option[data-ghost="true"] { color:var(--sp-text-muted); font-style:italic; }
.smax-triage-gse-chip { font-size:11px; color:var(--sp-accent); background:var(--sp-primary-bg); border-radius:999px; padding:2px 8px; text-transform:uppercase; letter-spacing:.05em; }
#smax-triage-gse-empty { font-size:12px; color:var(--sp-text-muted); text-align:center; padding:8px 4px; border:1px dashed var(--sp-border); border-radius:var(--sp-r-md); }
#smax-triage-gse-wrapper[data-state="staged"] #smax-triage-gse-display { border-color:var(--sp-staged); background:var(--sp-staged-bg); color:var(--sp-text); box-shadow:inset 0 0 0 1px var(--sp-staged); }
#smax-triage-gse-wrapper[data-state="staged"] #smax-triage-gse-dropdown { border-color:var(--sp-staged); }
#smax-triage-gse-wrapper[data-state="loading"] #smax-triage-gse-display { border-style:dashed; }

/* Body */
#smax-triage-hud-body { background:var(--sp-elevated); border:1px solid var(--sp-border); border-radius:var(--sp-r-lg); padding:14px 16px; margin:0 16px; flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
#smax-triage-ticket-details { flex:1; min-height:0; overflow:hidden; display:flex; flex-direction:column; }
#smax-triage-ticket-details img { max-width:100%; height:auto; display:block; border-radius:var(--sp-r-sm); margin-top:6px; }
.smax-triage-meta-row { display:flex; flex-wrap:wrap; align-items:center; gap:12px; font-size:13px; color:var(--sp-text); }
.smax-triage-field-label { color:var(--sp-text-muted); font-weight:600; }
.smax-triage-field-value { color:var(--sp-text); }
.smax-triage-divider { border-color:var(--sp-border); }

/* Footer */
#smax-triage-hud-footer { display:flex; flex-direction:column; gap:14px; padding:0 16px 16px; background:transparent; color:var(--sp-text); }
.smax-triage-top-row { display:flex; flex-wrap:wrap; gap:12px; justify-content:space-between; align-items:center; }
.smax-triage-urg-group { display:flex; flex-wrap:wrap; gap:6px; }
.smax-global-input { padding:8px 12px; border-radius:var(--sp-r-md); border:1px solid var(--sp-input-border); background:var(--sp-input-bg); color:var(--sp-input-text); font-size:12px; transition:border-color .15s, box-shadow .15s, background .15s; }
.smax-global-input::placeholder { color:var(--sp-text-muted); opacity:1; }
.smax-global-input:focus { outline:none; border-color:var(--sp-accent); box-shadow:0 0 0 3px var(--sp-ring); }
.smax-global-input[data-state="staged"] { border-color:var(--sp-staged); background:var(--sp-staged-bg); color:var(--sp-text); }
.smax-global-input[data-state="pending"] { border-color:var(--sp-pending); background:var(--sp-pending-bg); color:var(--sp-text); }

/* Custom dropdowns (team/worker/status) */
.smax-custom-dropdown-wrapper { position:relative; }
.smax-custom-dropdown-menu { display:none; position:absolute; top:calc(100% + 4px); left:0; right:0; background:var(--sp-surface); border:1px solid var(--sp-border); border-radius:var(--sp-r-md); box-shadow:var(--sp-shadow); z-index:10; max-height:220px; overflow-y:auto; }
.smax-custom-dropdown-wrapper[data-open="true"] .smax-custom-dropdown-menu { display:block; }
.smax-custom-dropdown-options { display:flex; flex-direction:column; }
.smax-custom-dropdown-item { padding:7px 10px; font-size:12px; color:var(--sp-text); cursor:pointer; transition:background .1s; border-bottom:1px solid var(--sp-border); }
.smax-custom-dropdown-item:last-child { border-bottom:none; }
.smax-custom-dropdown-item:hover { background:var(--sp-primary-hover); color:var(--sp-accent); }
.smax-custom-dropdown-item[data-selected="true"] { background:var(--sp-primary-bg); color:var(--sp-accent); font-weight:600; }
.smax-custom-dropdown-display { width:100%; border-radius:var(--sp-r-md); border:1px solid var(--sp-input-border); background:var(--sp-input-bg); color:var(--sp-input-text); font-size:12px; min-height:32px; padding:6px 12px; text-align:left; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:8px; transition:all .15s; }
.smax-custom-dropdown-display:hover { border-color:var(--sp-accent); }
.smax-custom-chevron { font-size:11px; color:var(--sp-text-muted); }
.smax-custom-dropdown-display[data-staged="true"] { border-color:var(--sp-staged) !important; background:var(--sp-staged-bg) !important; color:var(--sp-text) !important; box-shadow:inset 0 0 0 1px var(--sp-staged) !important; }
.smax-custom-dropdown-display[data-staged="false"] { border-color:var(--sp-pending) !important; background:var(--sp-pending-bg) !important; }
.smax-triage-status-dropdown { font-weight:600; min-width:110px; max-width:180px; }

/* Status colors (semanticas, contidas) */
.smax-triage-status-dropdown[data-status="RequestStatusSuspended"] { background-color:rgba(202,138,4,.16) !important; color:#a16207 !important; border-color:rgba(202,138,4,.4) !important; }
.smax-triage-status-dropdown[data-status="RequestStatusActive"],
.smax-triage-status-dropdown[data-status="RequestStatusInProgress"] { background-color:rgba(21,128,61,.16) !important; color:#15803d !important; border-color:rgba(21,128,61,.4) !important; }
.smax-triage-status-dropdown[data-status="RequestStatusComplete"] { background-color:rgba(10,92,192,.16) !important; color:#0a5cc0 !important; border-color:rgba(10,92,192,.4) !important; }
.smax-triage-status-dropdown[data-status="RequestStatusReady"] { background-color:rgba(21,128,61,.12) !important; color:#15803d !important; border-color:rgba(21,128,61,.3) !important; }
.smax-triage-status-dropdown[data-status="RequestStatusReject"],
.smax-triage-status-dropdown[data-status="RequestStatusAbandon"] { background-color:rgba(192,57,43,.16) !important; color:#b23427 !important; border-color:rgba(192,57,43,.4) !important; }
.smax-triage-status-dropdown[data-status="RequestStatusPending"],
.smax-triage-status-dropdown[data-status="RequestStatusPendingCustomer"],
.smax-triage-status-dropdown[data-status="RequestStatusPendingApproval"],
.smax-triage-status-dropdown[data-status="RequestStatusPendingChange"] { background-color:rgba(180,83,9,.16) !important; color:#b45309 !important; border-color:rgba(180,83,9,.4) !important; }
.smax-triage-status-dropdown[data-status="RequestStatusClassify"] { background-color:rgba(124,58,173,.16) !important; color:#7c3aad !important; border-color:rgba(124,58,173,.4) !important; }
[data-smax-theme="dark"] .smax-triage-status-dropdown[data-status="RequestStatusSuspended"],
[data-smax-theme="gray"] .smax-triage-status-dropdown[data-status="RequestStatusSuspended"] { color:#e0b84d !important; }
[data-smax-theme="dark"] .smax-triage-status-dropdown[data-status="RequestStatusActive"],
[data-smax-theme="dark"] .smax-triage-status-dropdown[data-status="RequestStatusInProgress"],
[data-smax-theme="gray"] .smax-triage-status-dropdown[data-status="RequestStatusActive"],
[data-smax-theme="gray"] .smax-triage-status-dropdown[data-status="RequestStatusInProgress"] { color:#5bbf7e !important; }
[data-smax-theme="dark"] .smax-triage-status-dropdown[data-status="RequestStatusComplete"],
[data-smax-theme="gray"] .smax-triage-status-dropdown[data-status="RequestStatusComplete"] { color:#7cbcf0 !important; }
[data-smax-theme="dark"] .smax-triage-status-dropdown[data-status="RequestStatusReject"],
[data-smax-theme="dark"] .smax-triage-status-dropdown[data-status="RequestStatusAbandon"],
[data-smax-theme="gray"] .smax-triage-status-dropdown[data-status="RequestStatusReject"],
[data-smax-theme="gray"] .smax-triage-status-dropdown[data-status="RequestStatusAbandon"] { color:#f06b6b !important; }
[data-smax-theme="dark"] .smax-triage-status-dropdown[data-status="RequestStatusPending"],
[data-smax-theme="dark"] .smax-triage-status-dropdown[data-status="RequestStatusPendingCustomer"],
[data-smax-theme="gray"] .smax-triage-status-dropdown[data-status="RequestStatusPending"],
[data-smax-theme="gray"] .smax-triage-status-dropdown[data-status="RequestStatusPendingCustomer"] { color:#e0a83c !important; }
[data-smax-theme="dark"] .smax-triage-status-dropdown[data-status="RequestStatusClassify"],
[data-smax-theme="gray"] .smax-triage-status-dropdown[data-status="RequestStatusClassify"] { color:#c191e8 !important; }

/* Botoes primarios / secundarios — padronizados (sem gradiente) */
.smax-triage-primary { padding:10px 20px; border-radius:var(--sp-r-md); border:none; cursor:pointer; background:var(--sp-send); color:#fff; font-weight:600; font-size:14px; box-shadow:0 2px 8px rgba(0,0,0,.12); transition:background .15s, transform .12s, box-shadow .15s; }
.smax-triage-primary:hover { background:var(--sp-send-hover); transform:translateY(-1px); box-shadow:0 4px 14px rgba(0,0,0,.18); }
#smax-triage-commit[data-suspended="true"] { background:var(--sp-pending) !important; color:#fff !important; box-shadow:0 2px 10px rgba(0,0,0,.18) !important; }
.smax-triage-secondary { padding:8px 14px; border-radius:var(--sp-r-md); border:1px solid var(--sp-border); background:var(--sp-surface-2); color:var(--sp-text); cursor:pointer; font-size:13px; transition:all .15s ease; }
.smax-triage-secondary:hover { background:var(--sp-primary-hover); border-color:var(--sp-accent); }

/* Urgencia — contida; cor solida so quando ativa */
.smax-triage-chip { transition:background-color .15s, color .15s, box-shadow .15s, transform .08s; }
.smax-triage-chip[data-active="true"], .smax-triage-chip[data-active="selected"] { transform:translateY(-1px); }
.smax-urg-low[data-active="true"]  { background:#e0b020;color:#3a2c00;border-color:#e0b020; box-shadow:0 2px 8px rgba(224,176,32,.35); }
.smax-urg-med[data-active="true"]  { background:#e08a3a;color:#3a2200;border-color:#e08a3a; box-shadow:0 2px 8px rgba(224,138,58,.35); }
.smax-urg-high[data-active="true"] { background:#e0682a;color:#fff;border-color:#e0682a; box-shadow:0 2px 8px rgba(224,104,42,.4); }
.smax-urg-crit[data-active="true"] { background:#d83a3a;color:#fff;border-color:#d83a3a; box-shadow:0 2px 8px rgba(216,58,58,.45); }

#smax-triage-status { font-size:12px; color:var(--sp-text-muted); }

/* Discussoes (esquerda) */
#smax-triage-discussions { width:340px; background:var(--sp-surface-2); border-right:1px solid var(--sp-border); border-radius:0; padding:14px; display:flex; flex-direction:column; gap:12px; overflow:auto; flex-shrink:0; min-height:0; max-height:100%; }
.smax-discussions-placeholder { font-size:13px; color:var(--sp-text-muted); line-height:1.5; }
.smax-discussion-card { border:1px solid var(--sp-border); border-radius:var(--sp-r-md); padding:10px 12px; background:var(--sp-elevated); display:flex; flex-direction:column; gap:8px; transition:border-color .15s, box-shadow .15s; }
.smax-discussion-card:hover { border-color:var(--sp-accent); box-shadow:0 4px 12px rgba(0,0,0,.10); }
.smax-discussion-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px; }
.smax-discussion-title { font-weight:600; color:var(--sp-text); }
.smax-discussion-privacy { font-size:11px; text-transform:uppercase; letter-spacing:.04em; padding:1px 8px; border-radius:999px; border:1px solid var(--sp-border); color:var(--sp-text); }
.smax-discussion-card[data-privacy="PUBLIC"] .smax-discussion-privacy { background:rgba(10,92,192,.10); border-color:rgba(10,92,192,.5); color:#0a5cc0; }
.smax-discussion-card[data-privacy="INTERNAL"] .smax-discussion-privacy { background:rgba(124,58,173,.10); border-color:rgba(124,58,173,.5); color:#7c3aad; }
.smax-discussion-card[data-privacy="EXTERNAL"] .smax-discussion-privacy { background:rgba(21,128,61,.10); border-color:rgba(21,128,61,.5); color:#15803d; }
[data-smax-theme="dark"] .smax-discussion-card[data-privacy="PUBLIC"] .smax-discussion-privacy,
[data-smax-theme="gray"] .smax-discussion-card[data-privacy="PUBLIC"] .smax-discussion-privacy { background:rgba(90,166,230,.14); border-color:rgba(90,166,230,.55); color:#7cbcf0; }
[data-smax-theme="dark"] .smax-discussion-card[data-privacy="INTERNAL"] .smax-discussion-privacy,
[data-smax-theme="gray"] .smax-discussion-card[data-privacy="INTERNAL"] .smax-discussion-privacy { background:rgba(167,139,250,.14); border-color:rgba(167,139,250,.55); color:#c4b5fd; }
[data-smax-theme="dark"] .smax-discussion-card[data-privacy="EXTERNAL"] .smax-discussion-privacy,
[data-smax-theme="gray"] .smax-discussion-card[data-privacy="EXTERNAL"] .smax-discussion-privacy { background:rgba(74,222,128,.14); border-color:rgba(74,222,128,.55); color:var(--sp-success-text); }
.smax-discussion-body { font-size:13px; color:var(--sp-text); line-height:1.45; max-height:150px; overflow:auto; }
.smax-discussion-body p { margin:0 0 6px; } .smax-discussion-body p:last-child { margin-bottom:0; }
.smax-discussion-meta { font-size:11px; color:var(--sp-text-muted); }

/* Editor de solucao (triagem) */
#smax-triage-quickreply-card { border:1px solid var(--sp-border); border-radius:var(--sp-r-md); padding:10px; background:var(--sp-surface); width:100%; box-sizing:border-box; transition:border-color .2s, box-shadow .2s; }
#smax-triage-quickreply-card[data-staged="true"] { border-color:var(--sp-accent); box-shadow:0 0 0 2px var(--sp-primary-bg); }
#smax-triage-quickreply-toolbar { display:flex; gap:2px; padding:5px 8px; background:var(--sp-surface-2); border:1px solid var(--sp-border); border-bottom:none; border-radius:var(--sp-r-md) var(--sp-r-md) 0 0; flex-wrap:wrap; align-items:center; }
#smax-triage-quickreply-editor { min-height:110px; width:100%; box-sizing:border-box; background:var(--sp-input-bg); border:1px solid var(--sp-border); border-radius:0 0 var(--sp-r-md) var(--sp-r-md); padding:12px 14px; color:var(--sp-text); font-size:14px; line-height:1.65; outline:none; font-family:inherit; transition:border-color .15s; overflow-y:auto; max-height:40vh; }
#smax-triage-quickreply-editor:focus { border-color:var(--sp-accent); box-shadow:0 0 0 3px var(--sp-ring); }
#smax-triage-status-row { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; padding:8px 0 0; border-top:1px solid var(--sp-border); }
#smax-triage-attachment-list { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:6px; font-size:12px; color:var(--sp-text-muted); min-height:22px; max-width:55%; }
.smax-attachment-chip { border:1px solid var(--sp-accent); border-radius:999px; padding:3px 10px; background:var(--sp-primary-bg); color:var(--sp-accent); font-size:11px; cursor:pointer; transition:all .15s; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.smax-attachment-chip:hover { background:var(--sp-accent); color:#fff; }
#smax-attachment-modal { position:fixed; inset:0; z-index:9999999; background:rgba(0,0,0,.85); display:none; align-items:center; justify-content:center; flex-direction:column; gap:12px; }
#smax-attachment-modal[data-visible="true"] { display:flex; }
#smax-attachment-modal img { max-width:90vw; max-height:80vh; border-radius:8px; object-fit:contain; box-shadow:0 8px 32px rgba(0,0,0,.5); }
#smax-attachment-modal > button:first-of-type { position:absolute; top:16px; right:16px; border:none; width:40px; height:40px; border-radius:50%; background:var(--sp-surface); color:var(--sp-text); font-size:22px; cursor:pointer; z-index:1; }
.smax-attachment-nav { position:absolute; top:50%; transform:translateY(-50%); border:none; width:44px; height:44px; border-radius:50%; background:rgba(255,255,255,.15); color:#fff; font-size:28px; cursor:pointer; z-index:1; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px); transition:background .15s; }
.smax-attachment-nav:hover { background:rgba(255,255,255,.3); }
.smax-attachment-nav-prev { left:16px; }
.smax-attachment-nav-next { right:16px; }
.smax-attachment-caption { color:#fff; font-size:13px; text-align:center; max-width:80vw; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }


/* ============================================================
   SETTINGS PANEL
   ============================================================ */
#smax-settings { background:var(--sp-bg); color:var(--sp-text); line-height:1.6; -webkit-font-smoothing:antialiased; font-family:"Segoe UI",system-ui,-apple-system,sans-serif; letter-spacing:.01em; }
#smax-settings .smax-sp-card { background:var(--sp-surface); border:1px solid var(--sp-border); border-radius:var(--sp-r-md); padding:12px; }
#smax-settings .smax-sp-section-title { font-weight:600; font-size:13px; color:var(--sp-text); margin-bottom:8px; }
#smax-settings .smax-sp-muted { font-size:12px; color:var(--sp-text-muted); }
#smax-settings button { font-family:"Segoe UI",system-ui,sans-serif; }
#smax-settings input[type="text"], #smax-settings input[type="number"], #smax-settings textarea, #smax-settings select { background:var(--sp-input-bg); color:var(--sp-text); border:1px solid var(--sp-input-border); }
#smax-settings select { min-height:36px; padding:6px 8px; font-size:13px; line-height:1.4; }
#smax-settings input[type="text"]:focus, #smax-settings textarea:focus, #smax-settings select:focus { border-color:var(--sp-accent); box-shadow:0 0 0 3px var(--sp-ring); outline:none; }
#smax-settings select option { background:var(--sp-surface); color:var(--sp-text); }
#smax-settings-sidebar { border-right:1px solid var(--sp-border) !important; }
#smax-settings-sidebar .smax-sidebar-item { width:100%; text-align:left; padding:8px 10px; border-radius:var(--sp-r-sm); border:none; cursor:pointer; font-size:12px; background:transparent; color:var(--sp-sidebar-text); transition:all .15s ease; display:flex; align-items:center; gap:8px; }
#smax-settings-sidebar .smax-sidebar-item:hover { background:var(--sp-primary-hover); color:var(--sp-primary); }
#smax-settings-sidebar .smax-sidebar-item.active { background:var(--sp-sidebar-active-bg); color:var(--sp-sidebar-active-text); font-weight:600; }
#smax-settings-content { flex:1; overflow-y:auto; padding:16px 20px; min-width:0; }
.smax-module-group-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.09em; color:var(--sp-text-dim); padding:10px 2px 5px; }
.smax-module-row { display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:var(--sp-r-md); border:1px solid var(--sp-border); cursor:pointer; transition:background .15s, border-color .15s, opacity .15s; user-select:none; margin-bottom:4px; background:var(--sp-surface); }
.smax-module-row:hover { border-color:var(--sp-border-strong); }
.smax-module-row.smax-active { background:var(--sp-primary-bg); border-color:var(--sp-primary); }
.smax-module-row:not(.smax-active) { opacity:.55; }
.smax-module-row:not(.smax-active):hover { opacity:.9; }
.smax-module-icon { font-size:16px; flex-shrink:0; width:22px; text-align:center; }
.smax-module-info { flex:1; min-width:0; }
.smax-module-name { font-size:13px; font-weight:500; color:var(--sp-text); }
.smax-module-desc { font-size:12px; color:var(--sp-text-muted); margin-top:1px; }
.smax-toggle-sw { position:relative; width:38px; height:22px; flex-shrink:0; }
.smax-toggle-sw input { opacity:0; width:0; height:0; position:absolute; }
.smax-toggle-track { position:absolute; inset:0; border-radius:999px; background:var(--sp-border-strong); transition:background .2s; }
.smax-toggle-sw input:checked + .smax-toggle-track { background:var(--sp-primary); }
.smax-toggle-track::before { content:''; position:absolute; width:16px; height:16px; border-radius:50%; background:#fff; top:3px; left:3px; transition:transform .2s; box-shadow:0 1px 3px rgba(0,0,0,.3); }
.smax-toggle-sw input:checked + .smax-toggle-track::before { transform:translateX(16px); }
.smax-team-item { background:var(--sp-surface) !important; border-color:var(--sp-border) !important; }
.smax-team-item strong { color:var(--sp-text) !important; }
.smax-team-item .smax-team-prio-info { color:var(--sp-text-muted) !important; }
.smax-team-edit-btn { color:var(--sp-text) !important; background:var(--sp-surface-2) !important; border-color:var(--sp-border) !important; }
.smax-team-del-btn { color:var(--sp-danger-text) !important; background:var(--sp-danger-bg) !important; border-color:var(--sp-danger-border) !important; }
#smax-settings input[type="text"], #smax-settings input[type="number"], #smax-settings textarea { background:var(--sp-input-bg) !important; border-color:var(--sp-input-border) !important; color:var(--sp-input-text) !important; }

/* misc */
.smax-absent-wrapper { display:inline-flex; align-items:center; gap:4px; cursor:pointer; font-size:12px; white-space:nowrap; }
.smax-absent-input { display:none; }
.smax-absent-box { width:14px; height:14px; border:1px solid var(--sp-border); border-radius:2px; background:var(--sp-input-bg); box-sizing:border-box; }
.smax-absent-input:checked + .smax-absent-box { background:var(--sp-danger); border-color:var(--sp-danger); }
#smax-settings-btn { width:50px; height:50px; border-radius:50%; border:1px solid var(--sp-border); background:var(--sp-surface); color:var(--sp-text); font-size:26px; display:flex; align-items:center; justify-content:center; box-shadow:0 6px 18px rgba(0,0,0,.2); cursor:pointer; transition:background .15s, border-color .15s; }
#smax-settings-btn:hover { background:var(--sp-primary-hover); border-color:var(--sp-accent); }
#smax-triage-start-btn { padding:12px 28px; border-radius:999px; border:none; cursor:pointer; font-size:16px; font-weight:600; background:var(--sp-accent); color:var(--sp-on-accent); box-shadow:0 4px 16px rgba(0,0,0,.18); transition:transform .15s, box-shadow .15s, background .15s; }
#smax-triage-start-btn:hover { transform:translateY(-2px); background:var(--sp-accent-hover); box-shadow:0 8px 22px rgba(0,0,0,.24); }



/* ============================================================
   REFINO v2 — ajustes de feedback (faz parte do entregavel)
   ============================================================ */
/* Campos editaveis MAIS CLAROS que o painel ao redor (dark/gray) */
:root            { --sp-field-bg:#ffffff; }
[data-smax-theme="dark"] { --sp-field-bg:#243044; }
[data-smax-theme="gray"] { --sp-field-bg:#3a3a3a; }
#smax-triage-quickreply-editor,
#smax-gse-fwd-editor { background:var(--sp-field-bg) !important; }

/* Discussoes da TRIAGEM com o MESMO padrao visual das Respostas (compacto) */
.smax-discussion-card { border:1px solid var(--sp-border); border-radius:var(--sp-r-md); padding:8px 10px; background:var(--sp-elevated); display:flex; flex-direction:column; gap:5px; transition:border-color .15s, box-shadow .15s; }
.smax-discussion-card:hover { border-color:var(--sp-accent); box-shadow:none; }
.smax-discussion-heading { display:flex; align-items:center; justify-content:space-between; gap:6px; font-size:12px; }
.smax-discussion-title { font-weight:600; font-size:12px; color:var(--sp-text); }
.smax-discussion-privacy { font-size:9px; padding:1px 7px; letter-spacing:.03em; }
.smax-discussion-body { font-size:13px; color:var(--sp-text); line-height:1.45; max-height:120px; }
.smax-discussion-meta { font-size:11px; color:var(--sp-text-muted); }

/* Toast e modal de anexo cientes do tema */
.smax-toast-refino { background:var(--sp-surface) !important; color:var(--sp-text) !important; border:1px solid var(--sp-border) !important; }



/* Status do chamado: fundo solido no Light (legivel sobre header azul) */
[data-smax-theme="light"] .smax-triage-status-dropdown[data-status="RequestStatusActive"],
[data-smax-theme="light"] .smax-triage-status-dropdown[data-status="RequestStatusInProgress"] { background-color:#dcfce7 !important; color:#15803d !important; border-color:#8fd3a8 !important; }
[data-smax-theme="light"] .smax-triage-status-dropdown[data-status="RequestStatusReady"] { background-color:#e6f7ec !important; color:#15803d !important; border-color:#9cdcb3 !important; }
[data-smax-theme="light"] .smax-triage-status-dropdown[data-status="RequestStatusSuspended"] { background-color:#fef3c7 !important; color:#92600a !important; border-color:#eccf86 !important; }
[data-smax-theme="light"] .smax-triage-status-dropdown[data-status="RequestStatusComplete"] { background-color:#dbeafe !important; color:#0a4fa0 !important; border-color:#9cc4f0 !important; }
[data-smax-theme="light"] .smax-triage-status-dropdown[data-status="RequestStatusReject"],
[data-smax-theme="light"] .smax-triage-status-dropdown[data-status="RequestStatusAbandon"] { background-color:#fde2e0 !important; color:#a82e22 !important; border-color:#f0ada6 !important; }
[data-smax-theme="light"] .smax-triage-status-dropdown[data-status="RequestStatusPending"],
[data-smax-theme="light"] .smax-triage-status-dropdown[data-status="RequestStatusPendingCustomer"],
[data-smax-theme="light"] .smax-triage-status-dropdown[data-status="RequestStatusPendingApproval"],
[data-smax-theme="light"] .smax-triage-status-dropdown[data-status="RequestStatusPendingChange"] { background-color:#ffedd5 !important; color:#a3490a !important; border-color:#f3c79a !important; }
[data-smax-theme="light"] .smax-triage-status-dropdown[data-status="RequestStatusClassify"] { background-color:#ede4fb !important; color:#6d2f9c !important; border-color:#d2bcef !important; }

/* ============================================================
   TRIAGE TOOLBAR & FIELD PICKER (shared CSS classes)
   ============================================================ */
.smax-resp-tb-btn { background:transparent; border:1px solid transparent; border-radius:var(--sp-r-sm); color:var(--sp-text-muted); cursor:pointer; font-size:12px; line-height:1; padding:4px 8px; transition:background .12s, color .12s; }
.smax-resp-tb-btn:hover { background:var(--sp-primary-hover); color:var(--sp-text); }
.smax-resp-tb-sep { width:1px; background:var(--sp-border); margin:3px 2px; align-self:stretch; }
.smax-resp-tb-color { width:22px; height:22px; padding:0; border:1px solid var(--sp-border); border-radius:var(--sp-r-sm); cursor:pointer; background:transparent; vertical-align:middle; }
.smax-resp-tb-select { background:var(--sp-surface-2); border:1px solid var(--sp-border); border-radius:var(--sp-r-sm); color:var(--sp-text-muted); font-size:11px; padding:2px 4px; cursor:pointer; height:24px; }
.smax-resp-tb-label { display:inline-flex; align-items:center; gap:2px; cursor:pointer; font-size:11px; color:var(--sp-text-muted); }
.smax-resp-field-picker { display:none; position:absolute; z-index:999999; background:var(--sp-surface); border:1px solid var(--sp-border); border-radius:var(--sp-r-md); box-shadow:var(--sp-shadow); overflow:hidden; width:380px; }
.smax-resp-field-picker-search { display:block; width:100%; box-sizing:border-box; background:var(--sp-input-bg); border:none; border-bottom:1px solid var(--sp-border); padding:9px 12px; color:var(--sp-text); font-size:12px; outline:none; font-family:inherit; }
.smax-resp-field-picker-list { max-height:230px; overflow-y:auto; }
.smax-resp-field-picker-item { padding:7px 12px; cursor:pointer; border-bottom:1px solid var(--sp-border); font-size:12px; color:var(--sp-text); transition:background .1s; display:flex; align-items:center; gap:7px; }
.smax-resp-field-picker-item:hover { background:var(--sp-primary-hover); color:var(--sp-accent); }
.smax-resp-field-picker-item.active { color:var(--sp-accent); background:var(--sp-primary-bg); font-weight:600; }
.smax-resp-field-picker-empty { padding:10px 12px; color:var(--sp-text-muted); font-size:11px; text-align:center; }
#smax-gse-fwd-editor { min-height:80px; max-height:220px; overflow-y:auto; border:1px solid var(--sp-border); border-radius:var(--sp-r-sm); padding:7px 9px; color:var(--sp-text); font-size:12px; line-height:1.5; background:var(--sp-input-bg); outline:none; cursor:text; }
#smax-gse-fwd-editor:empty:before { content:attr(data-placeholder); color:var(--sp-text-muted); pointer-events:none; }

`);


  /* ========================================================
   * Utilities
   * =======================================================*/
  const Utils = (() => {
    const debounce = (fn, wait = 120) => {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
      };
    };

    const getGridViewport = (root = document) => root.querySelector('.slick-viewport') || root;

    // Ticket detail URL: /saw/Request/<ID>/... — ID is alphanumeric, not just "Request"
    const isTicketDetailPage = () => /\/Request\/[A-Za-z0-9]{8,}/.test(window.location.href);
    const isListPage = () => !isTicketDetailPage();

    const parseSmaxDateTime = (str) => {
      if (!str) return null;
      const raw = String(str).trim();
      // Trata timestamps numéricos enviados como string (ex: FULL_LAYOUT pode retornar "1748794800000")
      if (/^\d{10,13}$/.test(raw)) return parseInt(raw, 10);
      const match = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (!match) return null;
      let [, d, mo, y, h, mi, s] = match;
      d = parseInt(d, 10);
      mo = parseInt(mo, 10) - 1;
      let year = parseInt(y, 10);
      if (year < 100) year += 2000;
      h = parseInt(h, 10);
      mi = parseInt(mi, 10);
      s = s ? parseInt(s, 10) : 0;
      return new Date(year, mo, d, h, mi, s).getTime();
    };

    const parseDigitRanges = (input) => {
      const digits = [];
      const parts = (input || '').split(',').map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        if (part.includes('-')) {
          const [start, end] = part.split('-').map((s) => parseInt(s.trim(), 10));
          if (!isNaN(start) && !isNaN(end) && start <= end) {
            for (let i = start; i <= end; i += 1) digits.push(i);
          }
        } else {
          const num = parseInt(part, 10);
          if (!isNaN(num)) digits.push(num);
        }
      }
      return [...new Set(digits)].sort((a, b) => a - b);
    };

    const digitsToRangeString = (digits) => {
      if (!digits || !digits.length) return '';
      const sorted = [...new Set(digits)].sort((a, b) => a - b);
      const ranges = [];
      let start = sorted[0];
      let end = sorted[0];

      for (let i = 1; i <= sorted.length; i += 1) {
        if (i < sorted.length && sorted[i] === end + 1) {
          end = sorted[i];
        } else {
          if (end - start >= 2) ranges.push(`${start}-${end}`);
          else if (end === start) ranges.push(`${start}`);
          else ranges.push(`${start},${end}`);
          start = sorted[i];
          end = sorted[i];
        }
      }

      return ranges.join(',');
    };

    const extractTrailingDigits = (text) => {
      const best = String(text || '').match(/(\d{2,})\b(?!.*\d)/);
      if (best) return best[1];
      const fallback = String(text || '').match(/(\d+)(?!.*\d)/);
      return fallback ? fallback[1] : '';
    };

    const normalizeRequestId = (value) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) return '';
      const digits = trimmed.replace(/\D/g, '');
      return digits || trimmed;
    };

    const normalizeAttachmentId = (value) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) return '';
      return trimmed.replace(/^Attachment:/i, '');
    };

    const locateSolutionEditor = () => {
      const ck = getPageCKEditor();
      if (!(ck && ck.instances)) return null;
      const instances = Object.values(ck.instances);
      // 1) Try specific field names first
      const specific = instances.find((inst) => {
        const el = inst.element && inst.element.$;
        if (!el) return false;
        const id = el.id || '';
        const name = el.getAttribute && el.getAttribute('name') || '';
        return /solution|solucao|plCkeditor|resposta|reply|answer|discussion/i.test(`${id} ${name}`);
      });
      if (specific) return specific;
      // 2) Fallback: any visible (non-detached) CKEditor instance
      return instances.find(inst => {
        try {
          const el = inst.element && inst.element.$;
          return el && document.body.contains(el) && el.offsetParent !== null;
        } catch { return false; }
      }) || null;
    };

    const focusSolutionEditor = () => {
      try {
        const hasCk = locateSolutionEditor();
        if (!hasCk) {
          const editIcon = document.querySelector('.icon-edit.pl-toolbar-item-icon');
          if (editIcon) editIcon.click();
        }
      } catch (err) {
        console.warn('[SMAX] Failed to toggle CKEditor:', err);
      }

      setTimeout(() => {
        try {
          const inst = locateSolutionEditor();
          if (inst && typeof inst.focus === 'function') {
            inst.focus();
            return;
          }
        } catch (err) {
          console.warn('[SMAX] Failed to focus CKEditor instance:', err);
        }

        const el = document.querySelector('[name="Solution"], #Solution, [id^="plCkeditor"], [data-aid="preview_Solution"]');
        if (el && typeof el.focus === 'function') {
          el.focus();
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 200);
    };

    const pushSolutionHtml = (html, { append = false } = {}) => new Promise((resolve) => {
      if (!html) {
        resolve(false);
        return;
      }
      focusSolutionEditor();
      let tries = 0;
      const attempt = () => {
        const inst = locateSolutionEditor();
        if (inst && typeof inst.setData === 'function') {
          try {
            if (append) inst.setData((inst.getData() || '') + html);
            else inst.setData(html);
            if (typeof inst.focus === 'function') inst.focus();
            resolve(true);
          } catch (err) {
            console.warn('[SMAX] Failed to push HTML into solution editor:', err);
            resolve(false);
          }
          return;
        }
        if (tries >= 10) {
          resolve(false);
          return;
        }
        tries += 1;
        setTimeout(attempt, 250);
      };
      attempt();
    });

    const SAFE_TAGS = new Set([
      'a','abbr','address','article','aside','b','bdi','bdo','blockquote','br','caption',
      'cite','code','col','colgroup','dd','del','details','dfn','div','dl','dt','em',
      'figcaption','figure','footer','h1','h2','h3','h4','h5','h6','header','hgroup',
      'hr','i','img','ins','kbd','li','main','mark','nav','ol','p','pre','q','rp','rt',
      'ruby','s','samp','section','small','span','strong','sub','summary','sup','table',
      'tbody','td','tfoot','th','thead','time','tr','u','ul','var','wbr',
    ]);
    const sanitizeRichText = (html) => {
      if (!html) return '';
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      // Remove dangerous tags entirely
      tmp.querySelectorAll('script, style, iframe, object, embed, form, input, textarea, select, button, svg, math, template, link, meta, base, noscript').forEach(el => el.remove());
      tmp.querySelectorAll('*').forEach((node) => {
        // Remove tags not in whitelist (keep children)
        if (!SAFE_TAGS.has(node.tagName.toLowerCase())) {
          node.replaceWith(...node.childNodes);
          return;
        }
        Array.from(node.attributes || []).forEach((attr) => {
          const name = attr.name.toLowerCase();
          if (/^on/i.test(name)) { node.removeAttribute(attr.name); return; }
          if (name === 'style') { node.removeAttribute(attr.name); return; }
          // Block javascript: / vbscript: and dangerous data: URIs (allow data:image/*)
          if (['href', 'src', 'action', 'xlink:href', 'formaction'].includes(name)) {
            const val = (attr.value || '').replace(/[\s\u0000-\u001F]+/g, '').toLowerCase();
            if (/^(javascript|vbscript)\s*:/i.test(val)) { node.removeAttribute(attr.name); return; }
            if (/^data\s*:/i.test(val) && !/^data\s*:\s*image\//i.test(val)) { node.removeAttribute(attr.name); }
          }
        });
      });
      return tmp.innerHTML;
    };

    const toAbsoluteUrl = (value) => {
      if (!value) return '';
      try {
        return new URL(value, window.location.origin).href;
      } catch {
        return value;
      }
    };

    const escapeHtml = (value) => {
      if (value == null) return '';
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    const onDomReady = (fn) => {
      if (typeof fn !== 'function') return;
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn, { once: true });
      } else {
        fn();
      }
    };

    const normalizeText = (s) => (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

    const formatBrDate = (ts, fallbackText, options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }, fallbackDefault = 'Faltando na visão') => {
      if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
        try { return new Date(ts).toLocaleString('pt-BR', options); } catch { }
      }
      const parsed = parseSmaxDateTime(fallbackText || '');
      if (parsed) {
        try { return new Date(parsed).toLocaleString('pt-BR', options); } catch { }
      }
      return fallbackText || fallbackDefault;
    };

    const deepClone = (value) => {
      if (Array.isArray(value)) return value.map((item) => deepClone(item));
      if (value && typeof value === 'object') {
        return Object.entries(value).reduce((acc, [key, val]) => {
          acc[key] = deepClone(val);
          return acc;
        }, {});
      }
      return value;
    };

    const normalizeHtml = (html) => (html || '')
      .replace(/\r/g, '')
      .replace(/\u00a0/gi, ' ')
      .trim();

    // Normaliza HTML gerado por contenteditable para envio à API SMAX.
    // Problema: navegadores geram <div>, <span style="...">, markup Office (<o:p>, mso-*),
    // etc. O SMAX trunca campos rich-text grandes (converte para links server-side).
    // Esta função:
    //  1. Remove markup Office e estilos desnecessários
    //  2. Converte <div>/<p> em <br> para layout flat
    //  3. Preserva formatação inline (b, i, u, a) e imagens
    //  4. Aplica sanitizeRichText para remover tags perigosas
    const normalizeContentEditableHtml = (html) => {
      if (!html) return '';
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      // Remove tags Office-specific e elementos invisíveis
      tmp.querySelectorAll('o\\:p, xml, style, meta, link, title, head').forEach(el => el.remove());
      // Remove atributos class e style de TODOS os elementos, EXCETO <img> (preserva src/style de imagens)
      tmp.querySelectorAll('*').forEach(el => {
        el.removeAttribute('class');
        el.removeAttribute('data-mce-style');
        el.removeAttribute('data-mce-fragment');
        if (el.tagName.toLowerCase() !== 'img') {
          el.removeAttribute('style');
        }
      });
      // Converte <div> e <p> em conteúdo + <br> (layout flat, compatível com SMAX)
      const flattenBlocks = (container) => {
        const blocks = container.querySelectorAll('div, p');
        // Processa de dentro para fora (inner blocks primeiro)
        Array.from(blocks).reverse().forEach(block => {
          const br = document.createElement('br');
          // Insere <br> antes do bloco, depois move os filhos para fora
          block.parentNode.insertBefore(br, block);
          while (block.firstChild) block.parentNode.insertBefore(block.firstChild, block);
          block.remove();
        });
      };
      flattenBlocks(tmp);
      // Aplica formatação padrão em imagens (mesmo estilo do "Formatar Texto e Imagens")
      tmp.querySelectorAll('img').forEach(img => {
        img.style.border = '4px solid #004b8d';
        img.style.borderRadius = '4px';
        img.style.boxSizing = 'border-box';
        img.style.padding = '0';
        img.style.marginTop = '10px';
        img.style.marginBottom = '10px';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.outline = 'none';
        img.style.boxShadow = 'none';
      });
      // Colapsa múltiplos <br> consecutivos em no máximo 2
      let result = tmp.innerHTML
        .replace(/&nbsp;/gi, ' ')
        .replace(/(<br\s*\/?\s*>){3,}/gi, '<br><br>')
        .replace(/^(<br\s*\/?\s*>)+/i, '')
        .replace(/(<br\s*\/?\s*>)+$/i, '')
        .trim();
      // Aplica sanitizeRichText para eliminar qualquer tag perigosa residual
      result = sanitizeRichText(result) || result;
      return result;
    };

    const triggerFileDownload = (objectUrl, filename) => {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename || 'anexo';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    };

    // ── CNJ linkifier ────────────────────────────────────────
    // Detecta dois formatos:
    //   Formatado : NNNNNNN-DD.AAAA.J.TT.OOOO  (ex: 4000439-14.2026.8.26.0201)
    //   Bruto     : 20 dígitos seguidos          (ex: 40004391420268260201)
    //
    // Ao clicar, foca/abre a aba nomeada "eproc-consulta" (já logada) e envia o
    // número via postMessage para o bridge script executar a busca de dentro da sessão.
    const CNJ_REGEX = /\b(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}|\d{20})\b/g;

    const formatRawCNJ = (raw) =>
      `${raw.slice(0,7)}-${raw.slice(7,9)}.${raw.slice(9,13)}.${raw.slice(13,14)}.${raw.slice(14,16)}.${raw.slice(16,20)}`;

    const normalizeCNJ = (s) => (/^\d{20}$/.test(s.trim()) ? formatRawCNJ(s.trim()) : s.trim());

    const EPROC_ORIGIN = 'https://eproc1g.tjsp.jus.br';
    const EPROC_URL    = 'https://eproc1g.tjsp.jus.br/eproc/controlador.php';

    // Abre sempre em nova aba e despacha o número via postMessage para o bridge executar a consulta.
    const openEprocProcess = (processNumber) => {
      const eprocWin = window.open(EPROC_URL, '_blank');
      if (!eprocWin) {
        // Popup bloqueado pelo navegador — copia o número como fallback
        navigator.clipboard?.writeText(processNumber).catch(() => {});
        alert(`Popups bloqueados pelo navegador.\nNúmero copiado: ${processNumber}\n\nPermita popups para este site nas configurações do navegador.`);
        return;
      }
      const msg = { type: 'SMAX_CONSULTAR_PROCESSO', num: processNumber };
      // Envia em múltiplos intervalos: a nova aba precisa carregar antes de receber a mensagem
      [800, 2000, 4000].forEach(d => setTimeout(() => {
        try { eprocWin.postMessage(msg, EPROC_ORIGIN); } catch (_) {}
      }, d));
    };

    const linkifyCNJ = (html) => {
      if (!html) return html;
      const tmp = document.createElement('div');
      tmp.innerHTML = html;

      const makeLink = (match) => {
        const formatted = normalizeCNJ(match);
        const span = document.createElement('span');
        span.textContent = formatted;
        span.dataset.smaxProc = formatted;
        span.style.cssText = 'color:var(--sp-accent);font-family:monospace;font-weight:600;border-bottom:1px dotted var(--sp-accent);cursor:pointer;';
        span.title = `Consultar processo no eProc: ${formatted}`;
        return span;
      };

      const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          CNJ_REGEX.lastIndex = 0;
          const text = node.textContent;
          if (!CNJ_REGEX.test(text)) return;
          CNJ_REGEX.lastIndex = 0;
          const frag = document.createDocumentFragment();
          let last = 0;
          let m;
          while ((m = CNJ_REGEX.exec(text)) !== null) {
            if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
            frag.appendChild(makeLink(m[1]));
            last = m.index + m[0].length;
          }
          if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
          node.parentNode.replaceChild(frag, node);
        } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'A' && node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') {
          Array.from(node.childNodes).forEach(walk);
        }
      };

      Array.from(tmp.childNodes).forEach(walk);
      return tmp.innerHTML;
    };
    // ────────────────────────────────────────────────────────

    const exportActivityCsv = (entries) => {
      if (!entries?.length) return;
      const pad2 = n => String(n).padStart(2, '0');
      const esc = v => { const s = String(v||''); return (s.includes(',')||s.includes('"')||s.includes('\n')) ? '"'+s.replace(/"/g,'""')+'"' : s; };
      const headers = ['Hora','Data','Chamado','Descrição','Ação','Atribuído Para','Global','Transferido Para','Status Op.','Respondido','Script','Usuário','Sucesso'];
      const rows = entries.map(e => {
        const desc = e.ticketSubject || DataRepository.triageCache.get(e.ticketId)?.subjectText || '';
        const d = new Date(e.ts);
        const hora = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
        const data = `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
        return [
          hora, data, e.ticketId, desc, e.relevantWork, e.assignedTo||'', e.globalChangeId||'',
          e.transferredTo||'', e.statusSCCDTo||'', e.answered?'Sim':'Não', e.usedScript?'Sim':'Não', e.user||'', e.success?'Sim':'Não'
        ].map(esc).join(',');
      });
      const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const now = new Date();
      const fn = `smax_relatorio_${pad2(now.getDate())}-${pad2(now.getMonth()+1)}-${now.getFullYear()}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fn;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    return {
      debounce,
      getGridViewport,
      isTicketDetailPage,
      isListPage,
      parseDigitRanges,
      digitsToRangeString,
      parseSmaxDateTime,
      extractTrailingDigits,
      locateSolutionEditor,
      focusSolutionEditor,
      pushSolutionHtml,
      sanitizeRichText,
      escapeHtml,
      onDomReady,
      normalizeRequestId,
      normalizeAttachmentId,
      toAbsoluteUrl,
      normalizeText,
      formatBrDate,
      deepClone,
      normalizeHtml,
      normalizeContentEditableHtml,
      triggerFileDownload,
      linkifyCNJ,
      normalizeCNJ,
      openEprocProcess,
      exportActivityCsv
    };
  })();

  // Delegação global de cliques em spans CNJ (data-smax-proc)
  // Usa fase de captura para interceptar antes do router SPA do SMAX
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-smax-proc]');
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    Utils.openEprocProcess(target.dataset.smaxProc);
  }, true);

  /* =========================================================
   * API client (tenant + REST helpers)
   * =======================================================*/
  const ApiClient = (() => {
    let cachedTenantId = null;

    const readCookie = (key) => {
      if (!key) return null;
      const match = document.cookie.match(new RegExp(`${key}=([^;]+)`));
      return match ? decodeURIComponent(match[1]) : null;
    };

    const pickTenantFromUrl = () => {
      try {
        const search = new URLSearchParams(window.location.search || '');
        return search.get('tenantid') || search.get('TENANTID');
      } catch {
        return null;
      }
    };

    const pickTenantFromHash = () => {
      const hash = window.location.hash || '';
      const match = hash.match(/tenantid=(\d+)/i);
      return match ? match[1] : null;
    };

    const pickTenantFromStorage = () => {
      try {
        return sessionStorage.getItem('smaxTenantId') || localStorage.getItem('smaxTenantId');
      } catch {
        return null;
      }
    };

    const resolveTenantId = () => {
      if (cachedTenantId) return cachedTenantId;
      const explicit = window.SMAX_TENANT_ID || window.globalTenantId;
      cachedTenantId = (explicit || pickTenantFromUrl() || pickTenantFromHash() || readCookie('TENANTID') || pickTenantFromStorage() || '').trim();
      if (!cachedTenantId) cachedTenantId = '';
      return cachedTenantId || null;
    };

    const setTenantId = (value) => {
      cachedTenantId = value ? String(value).trim() : '';
    };

    const getTenantId = () => resolveTenantId();

    const restBase = () => {
      const tenantId = getTenantId();
      return tenantId ? `/rest/${tenantId}` : '/rest';
    };

    const normalizePath = (path = '') => {
      if (!path) return restBase();
      if (/^https?:\/\//i.test(path)) return path;
      if (path.startsWith('/rest/')) return path;
      const trimmed = path.replace(/^\/+/, '');
      return `${restBase()}/${trimmed}`.replace(/\/+$/, '');
    };

    const toSearchParams = (input) => {
      if (!input) return null;
      if (input instanceof URLSearchParams) return input;
      const pairs = Object.entries(input).reduce((acc, [key, value]) => {
        if (value === undefined || value === null || value === '') return acc;
        acc.push([key, String(value)]);
        return acc;
      }, []);
      return pairs.length ? new URLSearchParams(pairs) : null;
    };

    const buildUrl = (path, { searchParams, includeTenantParam } = {}) => {
      const url = new URL(normalizePath(path), window.location.origin);
      const params = toSearchParams(searchParams);
      if (params) params.forEach((value, key) => url.searchParams.set(key, value));
      if (includeTenantParam) {
        const tenantId = getTenantId();
        if (tenantId) url.searchParams.set('TENANTID', tenantId);
      }
      return url.toString().replace(/\+/g, '%20');
    };

    const getXsrfToken = () => readCookie('XSRF-TOKEN');

    const prepareBody = (body, headers) => {
      if (!body || typeof body !== 'object') return body;
      if (body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer) return body;
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json;charset=utf-8';
      return JSON.stringify(body);
    };

    const request = async (path, options = {}) => {
      const {
        method = 'GET',
        headers = {},
        body,
        searchParams,
        includeTenantParam = false,
        useXsrf = false,
        expectJson = true,
        timeout = 30000
      } = options;
      const finalHeaders = {
        Accept: 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
        ...headers
      };
      if (useXsrf) {
        const token = getXsrfToken();
        if (token) finalHeaders['X-XSRF-TOKEN'] = token;
      }
      let abortTimer;
      const controller = timeout ? new AbortController() : null;
      if (controller && timeout) {
        abortTimer = setTimeout(() => controller.abort(), timeout);
      }
      const url = buildUrl(path, { searchParams, includeTenantParam });
      const response = await fetch(url, {
        method,
        headers: finalHeaders,
        body: prepareBody(body, finalHeaders),
        credentials: 'include',
        signal: controller ? controller.signal : undefined
      });
      if (abortTimer) clearTimeout(abortTimer);
      if (!response.ok) {
        let errBody = '';
        try { errBody = await response.text(); } catch {}
        if (errBody) console.warn(`[ApiClient] HTTP ${response.status} body:`, errBody.slice(0, 500));
        throw new Error(`[ApiClient] HTTP ${response.status}`);
      }
      if (!expectJson) return response.text();
      const text = await response.text();
      if (!text) return null;
      try { return JSON.parse(text); } catch { return text; }
    };

    const emsBulk = (payload, options = {}) => request('ems/bulk', {
      method: 'POST',
      body: payload,
      useXsrf: true,
      ...options
    });

    const collectionQuery = (entity, params = {}) => {
      const search = new URLSearchParams();
      ['filter', 'layout', 'view', 'orderBy', 'offset', 'size', 'fields'].forEach((key) => {
        if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
          search.set(key, params[key]);
        }
      });
      return request(`ems/${entity}`, {
        method: 'GET',
        searchParams: search,
        includeTenantParam: true
      });
    };

    const authenticate = (login, password, { tenantId } = {}) => {
      const params = {};
      const resolvedTenant = tenantId || getTenantId();
      if (resolvedTenant) params.TENANTID = resolvedTenant;
      return request('/auth/authentication-endpoint/authenticate/token', {
        method: 'POST',
        body: { login, password },
        searchParams: params,
        expectJson: false
      });
    };

    return {
      getTenantId,
      setTenantId,
      request,
      restUrl: normalizePath,
      ems: {
        bulk: emsBulk,
        collection: collectionQuery
      },
      authenticate
    };
  })();

  /* =========================================================
   * Teams Config (Multi-team Logic)
   * =======================================================*/
  const TeamsConfig = (() => {
    let cachedTeams = null;
    let _sharedTeams = [];

    const getTeams = () => {
      if (cachedTeams) return cachedTeams;
      try {
        const raw = prefs.teamsConfigRaw;
        // If raw is empty or error, use defaults from PrefStore
        const parsed = JSON.parse(raw || '[]');
        cachedTeams = Array.isArray(parsed) && parsed.length > 0 ? parsed : JSON.parse(PrefStore.defaults.teamsConfigRaw);
        // Ensure regex strings are converted to RegExps if needed
        cachedTeams.forEach(t => {
          if (t.matchers) {
            t.matchers.forEach(m => {
              if (m.type === 'regex' && typeof m.pattern === 'string') {
                // simple conversion assuming flags 'i' if not specified
                // Security note: trusted input only
                m._regex = new RegExp(m.pattern, 'i');
              }
            });
          }
        });
        // Append shared teams whose id isn't already defined locally
        const localIds = new Set(cachedTeams.map(t => t.id));
        for (const st of _sharedTeams) {
          if (!localIds.has(st.id)) cachedTeams.push({ ...st, _shared: true });
        }
        // Sort by priority desc
        cachedTeams.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      } catch (err) {
        console.warn('[SMAX] Failed to parse teams config:', err);
        cachedTeams = [];
      }
      return cachedTeams;
    };

    const setSharedTeams = (teams) => {
      _sharedTeams = Array.isArray(teams) ? teams : [];
      cachedTeams = null; // force rebuild on next getTeams()
    };

    const getTeamById = (id) => getTeams().find(t => t.id === id) || null;

    // Suggest a team based on ticket data
    // Suggest a team based on ticket data
    const suggestTeam = (ticket) => {
      const teams = getTeams();
      if (!ticket) return teams.find(t => t.isDefault) || teams[0];

      // Use GSE ID (ExpertGroup) for routing based on user requirement
      const gseId = ticket.assignmentGroupId || ticket.ExpertGroup || '';
      const gseName = (ticket.assignmentGroupName || '').toUpperCase();

      // Combine text for matching: GSE > Location > Description > Subject
      const matchText = [
        gseName,
        ticket.locationName || '',
        ticket.descriptionText || '',
        ticket.subjectText || '',
        ticket.descriptionHtml || '' // sometimes raw html helps if text is missing
      ].join(' ').toUpperCase();

      for (const team of teams) {
        if (team.isDefault) continue;

        // Check gseRules (list of {id, name})
        if (team.gseRules && Array.isArray(team.gseRules)) {
          // Check ID
          if (team.gseRules.some(r => r.id === gseId)) return team;
          // Check Name if ID didn't match (or wasn't present)
          if (gseName && team.gseRules.some(r => (r.name || r.id || '').toUpperCase() === gseName)) return team;
        }

        // Check legacy/simple gseIds
        if (team.gseIds && Array.isArray(team.gseIds)) {
          if (team.gseIds.includes(gseId)) return team;
        }

        // Check matchers — scope: 'location' = só Local de Registro; 'text' = assunto+descrição; outros = qualquer campo
        if (team.matchers && Array.isArray(team.matchers)) {
          for (const m of team.matchers) {
            if (m.type === 'regex' && m._regex) {
              const scope = m.scope || 'location';
              const testStr = scope === 'location'
                ? (ticket.locationName || '').toUpperCase()
                : scope === 'text'
                  ? [ticket.subjectText || '', ticket.descriptionText || ''].join(' ').toUpperCase()
                  : matchText;
              if (m._regex.test(testStr)) return team;
            }
          }
        }

        // Fallback: Check if Team ID or Name is contained in GSE Name (Loose match for "Work exclusively with GSE")
        if (gseName) {
          const idMatch = team.id && gseName.includes(team.id.toUpperCase());
          // Careful with Name match: "JEC / JUIZADO" might not match "VARA DO JEC".
          // But we can check parts or simpler logic? For now, ID match is safest fallback.
          if (idMatch) return team;
        }
      }

      return teams.find(t => t.isDefault) || teams[0];
    };

    const parseWorkers = (rawText) => {
      // Line-based parser: Name (Digits)
      // e.g. "Douglas (00-10)"
      return rawText.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
        // simplified matcher
        const match = line.match(/^(.+?)\s*[\(\[]([\d,\-\s]+)[\)\]]$/);
        if (match) {
          return { name: match[1].trim(), digits: match[2].trim() };
        }
        return { name: line, digits: '' }; // fallback
      });
    };

    const suggestWorker = (team, ticketIdOrText) => {
      if (!team || !team.workers || !team.workers.length) return null;

      const digitBlock = Utils.extractTrailingDigits(ticketIdOrText) || '';
      if (digitBlock.length < 2) return null;

      // Sliding window loop: check last 2 digits, if owned by absent (or no one?), shift left.
      // Logic mirrors Distribution.ownerForDigits: checks i=length down to 2.
      // e.g. ...5555510 -> check 10. If absent, check 51. If absent, check 55.
      for (let i = digitBlock.length; i >= 2; i -= 1) {
        const pair = digitBlock.slice(i - 2, i);
        const digit = parseInt(pair, 10);
        if (isNaN(digit)) continue;

        for (const w of team.workers) {
          // Optimization: create ranges once per worker/team reload? For now, keep it simple/safe.
          const ranges = Utils.parseDigitRanges(w.digits);
          if (ranges.includes(digit)) {
            if (w.isAbsent) break; // Found owner but absent -> Break inner loop, continue outer (try next pair)
            return w; // Found owner and present -> Return
          }
        }
      }
      return null;
    };

    const getWorkersForTeam = (id) => {
      const t = getTeamById(id);
      return t ? (t.workers || []) : [];
    };

    const reload = () => { cachedTeams = null; };

    return { getTeams, getTeamById, getWorkersForTeam, suggestTeam, suggestWorker, reload, setSharedTeams };
  })();

  /* =========================================================
   * Data repository (requests + people caches)
   * =======================================================*/
  const DataRepository = (() => {
    const triageCache = new Map();
    let triageIds = [];
    const peopleCache = new Map();

    // Eviction: mantém os caches dentro de limites razoáveis para sessões longas
    const TRIAGE_CACHE_MAX  = 400;
    const TRIAGE_CACHE_TRIM = 150; // quantas entradas mais antigas remover quando excede o limite
    const PEOPLE_CACHE_MAX  = 600;
    const PEOPLE_CACHE_TRIM = 200;
    const trimMap = (map, max, trim) => {
      if (map.size <= max) return;
      let removed = 0;
      for (const key of map.keys()) {
        if (removed >= trim) break;
        map.delete(key);
        removed++;
      }
    };
    const supportGroupMap = new Map();
    let supportGroupTotal = null;
    const supportGroupListeners = new Set();
    let supportGroupsLoadPromise = null;
    let supportGroupsLoadedOnce = false;

    let peopleTotal = null;
    const queueListeners = new Set();
    const peopleListeners = new Set();
    const getSupportGroupsSnapshot = () => Array.from(supportGroupMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const notifySupportGroupListeners = () => {
      const snapshot = getSupportGroupsSnapshot();
      supportGroupListeners.forEach((fn) => {
        try { fn(snapshot); } catch (err) { console.warn('[SMAX] Support group listener failed:', err); }
      });
    };
    let peopleLoadPromise = null;
    let peopleLoadedOnce = false;
    const ingestSupportGroupPayload = (payload) => {
      try {
        if (!payload || typeof payload !== 'object') return;
        if (payload.meta && typeof payload.meta.total_count === 'number') supportGroupTotal = payload.meta.total_count;
        const entities = Array.isArray(payload.entities) ? payload.entities : [];
        entities.forEach((ent) => {
          if (!ent || ent.entity_type !== 'PersonGroup') return;
          const props = ent.properties || {};
          const id = props.Id != null ? String(props.Id) : '';
          const name = (props.Name || '').toString().trim();
          if (!id || !name) return;
          supportGroupMap.set(id, { id, name, isDeleted: !!props.IsDeleted });
        });
        notifySupportGroupListeners();
      } catch (err) {
        console.warn('[SMAX] Failed to ingest support group payload:', err);
      }
    };

    const notifyQueueListeners = () => {
      queueListeners.forEach((fn) => {
        try { fn(); } catch (err) { console.warn('[SMAX] Queue listener failed:', err); }
      });
    };

    const notifyPeopleListeners = () => {
      peopleListeners.forEach((fn) => {
        try { fn(peopleCache); } catch (err) { console.warn('[SMAX] People listener failed:', err); }
      });
    };

    const discussionPurposeLabels = {
      SolucaoContorno_c: 'Solução de Contorno',
      FollowUp: 'Acompanhamento',
      StatusUpdate: 'Atualização de status',
      Resolution: 'Resolução',
      Workaround: 'Solução temporária',
      CustomerResponse: 'Resposta do usuário',
      AgentResponse: 'Resposta do agente',
      Information: 'Informação adicional',
      CommunicationLog: 'Registro de comunicação',
      WorkLog: 'Registro de trabalho'
    };

    const mapPurposeLabel = (code) => {
      if (!code) return 'Discussão';
      if (discussionPurposeLabels[code]) return discussionPurposeLabels[code];
      const cleaned = String(code)
        .replace(/_c$/i, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .trim();
      if (!cleaned) return 'Discussão';
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    };

    const mapPrivacyLabel = (privacy) => {
      if (!privacy) return { code: '', label: 'Interno' };
      const normalized = String(privacy).toUpperCase();
      if (normalized === 'PUBLIC') return { code: normalized, label: 'Público' };
      if (normalized === 'EXTERNAL') return { code: normalized, label: 'Externo' };
      return { code: normalized, label: 'Interno' };
    };
    const normalizeGroupIdValue = (value) => {
      if (!value) return '';
      if (typeof value === 'string') {
        const cleaned = value.replace(/PersonGroup:?/i, '').trim();
        const match = cleaned.match(/\d{3,}/g);
        if (match && match.length) return match[match.length - 1];
        return cleaned;
      }
      if (typeof value === 'object') {
        if (value.Id != null) return String(value.Id);
        if (value.id != null) return String(value.id);
        if (value.href) {
          const match = String(value.href).match(/PersonGroup\/([0-9]+)/i);
          if (match) return match[1];
        }
      }
      return '';
    };
    const pickAssignmentGroupMeta = (props = {}, rel = {}) => {
      const relGroup = rel && rel.AssignmentGroup ? rel.AssignmentGroup : null;
      const relExpertGroup = rel && rel.ExpertGroup ? rel.ExpertGroup : null;
      const relAssignedGroup = rel && rel.AssignedToGroup ? rel.AssignedToGroup : null;
      const idSources = [
        props.AssignmentGroup,
        relGroup,
        props.AssignmentGroupRef,
        props.AssignmentGroupId,
        props.AssignmentGroupId_c,
        props.ExpertGroup,
        relExpertGroup,
        relAssignedGroup,
        props.AssignedToGroup
      ];
      let assignmentGroupId = '';
      for (const src of idSources) {
        assignmentGroupId = normalizeGroupIdValue(src);
        if (assignmentGroupId) break;
      }
      const nameCandidates = [
        props.AssignmentGroupDisplayLabel,
        props.AssignmentGroupName,
        relGroup && (relGroup.DisplayLabel || relGroup.Name || relGroup.label),
        relExpertGroup && (relExpertGroup.DisplayLabel || relExpertGroup.Name || relExpertGroup.label),
        relAssignedGroup && (relAssignedGroup.DisplayLabel || relAssignedGroup.Name || relAssignedGroup.label)
      ];
      let assignmentGroupName = '';
      for (const candidate of nameCandidates) {
        if (!candidate) continue;
        const trimmed = String(candidate).trim();
        if (trimmed) {
          assignmentGroupName = trimmed;
          break;
        }
      }
      return { assignmentGroupId, assignmentGroupName };
    };

    const normalizeCommentEntry = (raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const bodySource = raw.CommentBody || raw.Body || raw.body || '';
      let safeHtml = Utils.sanitizeRichText(bodySource);
      if (!safeHtml) {
        const fallback = bodySource ? Utils.escapeHtml(String(bodySource)) : '';
        safeHtml = fallback;
      }
      const tmp = document.createElement('div');
      tmp.innerHTML = safeHtml;
      const bodyText = (tmp.textContent || tmp.innerText || '').trim();
      const timeRaw = raw.CreateTime;
      let createdTs = 0;
      if (typeof timeRaw === 'number') createdTs = timeRaw;
      else if (timeRaw) createdTs = Utils.parseSmaxDateTime(String(timeRaw)) || 0;
      if (!safeHtml && !bodyText) return null;

      const purposeCode = raw.FunctionalPurpose || '';
      const privacyRaw  = raw.PrivacyType || '';
      const { code: privacyCode, label: privacyLabel } = mapPrivacyLabel(privacyRaw);
      const submitter = raw.Submitter || raw.SubmitterId || '';
      let submitterPersonId = '';
      if (submitter) {
        const match = submitter.match(/Person\/(\d+)/i);
        if (match) submitterPersonId = match[1];
      }
      const submitterDisplayCandidates = [raw.SubmitterDisplay, raw.CommentFrom, raw.CommentTo];
      let submitterDisplay = '';
      for (const candidate of submitterDisplayCandidates) {
        if (!candidate) continue;
        const trimmed = String(candidate).trim();
        if (trimmed) {
          submitterDisplay = trimmed;
          break;
        }
      }
      const actualInterface = (raw.ActualInterface || '').toUpperCase();
      const systemGenerated = actualInterface === 'SYSTEM';
      const idFallbackSeed = purposeCode || submitter || 'comment';
      const id = raw.CommentId || raw.id || raw.Id || `${idFallbackSeed}-${createdTs || Date.now()}`;

      return {
        id,
        purposeCode,
        purposeLabel: mapPurposeLabel(purposeCode),
        privacyCode,
        privacyRaw,
        privacyLabel,
        bodyRaw: bodySource,
        bodyHtml: safeHtml,
        bodyText,
        createdTs,
        createdRaw: timeRaw || '',
        systemGenerated,
        submitter,
        submitterPersonId,
        submitterDisplay
      };
    };

    const parseCommentsCollection = (value) => {
      if (!value) return [];
      let payload = value;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (err) {
          console.warn('[SMAX] Failed to parse comments payload:', err);
          return [];
        }
      }
      let list = [];
      if (Array.isArray(payload)) list = payload;
      else if (Array.isArray(payload.Comment)) list = payload.Comment;
      else if (Array.isArray(payload.comments)) list = payload.comments;
      else if (Array.isArray(payload.complexTypeProperties)) list = payload.complexTypeProperties.map((item) => item && item.properties).filter(Boolean);
      const normalized = [];
      list.forEach((entry) => {
        const parsed = normalizeCommentEntry(entry);
        if (parsed) normalized.push(parsed);
      });
      normalized.sort((a, b) => (a.createdTs || 0) - (b.createdTs || 0));
      return normalized;
    };

    const upsertTriageEntryFromProps = (props, rel) => {
      if (!props) return;

      if (rel && typeof rel === 'object') {
        Object.values(rel).forEach((val) => {
          if (val && typeof val === 'object' && val.Id && val.Name) {
            const pid = String(val.Id);
            if (!DataRepository.peopleCache.has(pid)) {
              let firstName = val.Name;
              let lastName = '';
              const parts = val.Name.split(' ');
              if (parts.length > 1) {
                firstName = parts[0];
                lastName = parts.slice(1).join(' ');
              }
              DataRepository.peopleCache.set(pid, {
                id: pid,
                name: val.Name,
                upn: val.Upn || '',
                firstName,
                lastName,
                fullName: val.Name,
                IsVIP: !!val.IsVIP
              });
            }
          }
        });
      }

      const id = props.Id != null ? String(props.Id) : '';
      if (!id) return;

      const createdRaw = props.CreateTime;
      let createdText = '';
      let createdTs = 0;
      if (typeof createdRaw === 'number') {
        createdTs = createdRaw;
        createdText = new Date(createdRaw).toLocaleString();
      } else if (createdRaw != null) {
        createdText = String(createdRaw);
        createdTs = Utils.parseSmaxDateTime(createdText) || 0;
      }

      const priority = props.Priority || '';
      const isVipPerson = !!(rel && rel.RequestedForPerson && rel.RequestedForPerson.IsVIP);
      const isVip = isVipPerson || /VIP/i.test(String(priority));

      const descHtml = props.Description || '';
      const tmpDiv = document.createElement('div');
      tmpDiv.innerHTML = String(descHtml);
      const fullText = (tmpDiv.textContent || tmpDiv.innerText || '').trim();
      const subjectText = fullText.split('\n')[0] || '';
      const hasInlineImage = /<img\b/i.test(String(descHtml));

      const solutionHtml = props.Solution || '';
      const solutionDiv = document.createElement('div');
      solutionDiv.innerHTML = String(solutionHtml);
      const solutionText = (solutionDiv.textContent || solutionDiv.innerText || '').trim();

      const idNum = parseInt(id.replace(/\D/g, ''), 10);
      const existing = triageCache.get(id) || {};
      let requestedForName = '';
      let requestedForPersonId = existing.requestedForPersonId || '';
      let requestedForTitle = existing.requestedForTitle || '';
      const requestedRel = rel && rel.RequestedForPerson ? rel.RequestedForPerson : null;
      const requestedProps = props && props.RequestedForPerson ? props.RequestedForPerson : null;
      if (requestedRel && requestedRel.Id) requestedForPersonId = String(requestedRel.Id);
      if (requestedRel && requestedRel.Title) requestedForTitle = String(requestedRel.Title).trim();
      const requestedCandidates = [
        requestedRel && requestedRel.DisplayLabel,
        requestedRel && requestedRel.Name,
        requestedRel && requestedRel.PrimaryDisplayValue,
        requestedRel && requestedRel.FullName,
        requestedProps && requestedProps.DisplayLabel,
        requestedProps && requestedProps.Name,
        requestedProps && requestedProps.FullName,
        props && props.RequestedForDisplayLabel,
        props && props.RequestedForName
      ];
      for (const candidate of requestedCandidates) {
        if (!candidate) continue;
        const trimmed = String(candidate).trim();
        if (trimmed) {
          requestedForName = trimmed;
          break;
        }
      }
      if (!requestedForName && existing.requestedForName) requestedForName = existing.requestedForName;

      let discussions = parseCommentsCollection(props.Comments || props.comments);
      if (!discussions.length && existing.discussions) discussions = existing.discussions;

      // Extract process number from UserOptions (NumerodoProcesso_c field)
      let processNumber = '';
      try {
        const userOpts = props.UserOptions;
        if (userOpts) {
          let parsed = userOpts;
          if (typeof userOpts === 'string') parsed = JSON.parse(userOpts);
          if (parsed && Array.isArray(parsed.complexTypeProperties) && parsed.complexTypeProperties.length) {
            const innerProps = parsed.complexTypeProperties[0]?.properties;
            if (innerProps && innerProps.NumerodoProcesso_c) {
              processNumber = String(innerProps.NumerodoProcesso_c).trim();
            }
          }
        }
      } catch (err) {
        console.warn('[SMAX] Failed to parse UserOptions for process number:', err);
      }
      if (!processNumber && existing.processNumber) processNumber = existing.processNumber;

      // Extract RegisteredForLocation (read-only display)
      let locationId = '';
      let locationName = '';
      const locationRel = rel && rel.RegisteredForLocation ? rel.RegisteredForLocation : null;
      if (locationRel) {
        locationId = locationRel.Id ? String(locationRel.Id) : '';
        const locationCandidates = [
          locationRel.DisplayLabel,
          locationRel.Name,
          locationRel.DisplayName,
          locationRel.FullName
        ];
        for (const candidate of locationCandidates) {
          if (!candidate) continue;
          const trimmed = String(candidate).trim();
          if (trimmed) {
            locationName = trimmed;
            break;
          }
        }
      }
      if (!locationId && existing.locationId) locationId = existing.locationId;
      if (!locationName && existing.locationName) locationName = existing.locationName;

      // Extract Status (e.g. "RequestStatusSuspended")
      let status = props.Status ? String(props.Status).trim() : '';
      if (!status && existing.status) status = existing.status;

      const { assignmentGroupId, assignmentGroupName } = pickAssignmentGroupMeta(props, rel);
      // ExpertAssignee pode vir como flat string em props (lista) ou como objeto em rel (FULL_LAYOUT)
      const expertAssigneeId = props.ExpertAssignee
        ? String(props.ExpertAssignee)
        : (rel.ExpertAssignee?.Id || rel.ExpertAssignee?.id)
          ? String(rel.ExpertAssignee.Id || rel.ExpertAssignee.id)
          : (existing.expertAssigneeId || '');

      // Extrai chamado global (pai) via rel.GlobalId_c ou props.GlobalId_c — campo customizado TJSP
      // Em consultas em lote, o valor vem em props como ID simples; em FULL_LAYOUT, vem em rel como objeto
      let globalChangeId = existing.globalChangeId || '';
      if (!globalChangeId && rel && rel.GlobalId_c) {
        const rawId = String(rel.GlobalId_c.Id || rel.GlobalId_c.id || '').trim();
        if (rawId && rawId !== id) globalChangeId = rawId;
      }
      if (!globalChangeId && props.GlobalId_c) {
        const rawId = String(props.GlobalId_c).replace(/^IMRfc:/i, '').trim();
        if (rawId && rawId !== id) globalChangeId = rawId;
      }

      // Armazena LastUpdateTime e array bruto de comentários para uso em postDiscussion
      const lastUpdateTime = props.LastUpdateTime || existing.lastUpdateTime || 0;
      let rawComments = existing.rawComments || [];
      if (props.Comments) {
        try {
          const parsed = typeof props.Comments === 'string' ? JSON.parse(props.Comments) : props.Comments;
          if (Array.isArray(parsed?.Comment)) rawComments = parsed.Comment;
        } catch (_) { /* mantém existing.rawComments */ }
      }

      triageCache.set(id, Object.assign({}, existing, {
        idText: id,
        idNum: Number.isNaN(idNum) ? null : idNum,
        createdText,
        createdTs,
        isVip,
        subjectText,
        descriptionHtml: String(descHtml),
        descriptionText: fullText,
        hasInlineImage,
        solutionHtml: String(solutionHtml),
        solutionText,
        requestedForName,
        requestedForPersonId,
        requestedForTitle,
        discussions,
        assignmentGroupId,
        assignmentGroupName,
        expertAssigneeId,
        processNumber,
        locationId,
        locationName,
        status,
        statusSCCD: props.StatusSCCDSMAX_c || existing.statusSCCD || '',
        globalChangeId,
        lastUpdateTime,
        rawComments
      }));
      trimMap(triageCache, TRIAGE_CACHE_MAX, TRIAGE_CACHE_TRIM);
    };

    const ingestRequestListPayload = (obj) => {
      try {
        if (!obj || typeof obj !== 'object') return;
        const entities = Array.isArray(obj.entities) ? obj.entities : [];
        const list = [];
        for (const ent of entities) {
          if (!ent || typeof ent !== 'object') continue;
          const props = ent.properties || {};
          const rel = ent.related_properties || {};
          upsertTriageEntryFromProps(props, rel);

          const id = props.Id != null ? String(props.Id) : '';
          if (!id) continue;

          const createdRaw = props.CreateTime;
          let createdTs = 0;
          if (typeof createdRaw === 'number') createdTs = createdRaw;

          const priority = props.Priority || '';
          const isVipPerson = !!(rel && rel.RequestedForPerson && rel.RequestedForPerson.IsVIP);
          const isVip = isVipPerson || /VIP/i.test(String(priority));

          const idNum = parseInt(id.replace(/\D/g, ''), 10);
          list.push({
            idText: id,
            idNum: Number.isNaN(idNum) ? null : idNum,
            createdTs,
            isVip,
            assignmentGroupId: props.ExpertGroup || '',
            assignmentGroupName: (rel.ExpertGroup && rel.ExpertGroup.Name) || ''
          });
        }

        if (list.length) {
          list.sort((a, b) => {
            if (a.isVip !== b.isVip) return a.isVip ? -1 : 1;
            if (a.createdTs !== b.createdTs) return a.createdTs - b.createdTs;
            if (a.idNum != null && b.idNum != null && a.idNum !== b.idNum) return a.idNum - b.idNum;
            return 0;
          });
          triageIds = list;
          notifyQueueListeners();
        }
      } catch (err) {
        console.warn('[SMAX] Failed to ingest request payload:', err);
      }
    };

    const ingestRequestDetailPayload = (obj) => {
      try {
        if (!obj || typeof obj !== 'object') return;
        const entities = Array.isArray(obj.entities) ? obj.entities : [];
        if (!entities.length) return;
        const ent = entities[0] || {};
        upsertTriageEntryFromProps(ent.properties || {}, ent.related_properties || {});
      } catch (err) {
        console.warn('[SMAX] Failed to ingest request detail payload:', err);
      }
    };

    const ingestPersonListPayload = (obj) => {
      try {
        if (!obj || typeof obj !== 'object') return;
        if (obj.meta && typeof obj.meta.total_count === 'number') {
          peopleTotal = obj.meta.total_count;
        }
        const entities = Array.isArray(obj.entities) ? obj.entities : [];
        for (const ent of entities) {
          if (!ent || typeof ent !== 'object') continue;
          if (ent.entity_type !== 'Person') continue;
          const props = ent.properties || {};
          const id = props.Id != null ? String(props.Id) : '';
          if (!id) continue;

          const payload = {
            id,
            name: (props.Name || '').toString().trim(),
            upn: (props.Upn || '').toString().trim(),
            email: (props.Email || '').toString().trim(),
            isVip: !!props.IsVIP,
            employeeNumber: props.EmployeeNumber || '',
            firstName: props.FirstName || '',
            lastName: props.LastName || '',
            location: props.Location || '',
            title: (props.Title || '').toString().trim()
          };
          if (!payload.email && !payload.upn) continue;
          peopleCache.set(id, payload);
        }
        trimMap(peopleCache, PEOPLE_CACHE_MAX, PEOPLE_CACHE_TRIM);
        notifyPeopleListeners();
      } catch (err) {
        console.warn('[SMAX] Failed to ingest person payload:', err);
      }
    };

    const buildPeopleFilter = () => {
      const ids = new Set();
      try {
        for (const t of TeamsConfig.getTeams()) {
          if (Array.isArray(t.gseRules)) t.gseRules.forEach(r => { if (r.id) ids.add(r.id); });
        }
      } catch (_) { /* ignore */ }
      if (!ids.size) return '(PersonToGroup[Id in (51642955)])';
      return `(PersonToGroup[Id in (${[...ids].join(',')})])`;
    };
    const basePeopleParams = {
      layout: 'Name,Avatar,Location,IsVIP,OrganizationalGroup,Upn,IsDeleted,FirstName,LastName,EmployeeNumber,Email,Title',
      meta: 'totalCount',
      order: 'Name asc',
      size: 50,
      skip: 0
    };
    const supportGroupBaseParams = {
      filter: "(Status = 'Active' or Status = null)",
      layout: 'Id,Name,IsDeleted',
      meta: 'totalCount',
      order: 'Name asc',
      size: 200,
      skip: 0
    };

    const toQueryParams = (base, overrides = {}) => {
      const merged = Object.assign({}, base, overrides);
      return Object.entries(merged).reduce((acc, [key, value]) => {
        if (value === undefined || value === null || value === '') return acc;
        acc[key] = value;
        return acc;
      }, {});
    };

    const fetchPeoplePage = async (skip = 0) => {
      const payload = await ApiClient.request('ems/Person', {
        method: 'GET',
        searchParams: toQueryParams(basePeopleParams, { skip, filter: buildPeopleFilter() }),
        includeTenantParam: true
      });
      ingestPersonListPayload(payload);
      return payload;
    };
    const fetchSupportGroupPage = async (skip = 0) => {
      const payload = await ApiClient.request('ems/PersonGroup', {
        method: 'GET',
        searchParams: toQueryParams(supportGroupBaseParams, { skip }),
        includeTenantParam: true
      });
      ingestSupportGroupPayload(payload);
      return payload;
    };

    const ensurePeopleLoaded = ({ force = false } = {}) => {
      if (peopleLoadedOnce && !force) return peopleLoadPromise || Promise.resolve();
      if (peopleLoadPromise) return peopleLoadPromise;
      peopleLoadPromise = fetchPeoplePage(0)
        .then((firstPage) => {
          const total = typeof peopleTotal === 'number'
            ? peopleTotal
            : ((firstPage && firstPage.meta && firstPage.meta.total_count) || peopleCache.size);
          const needed = typeof total === 'number' ? total : 0;
          if (!needed || needed <= peopleCache.size) {
            peopleLoadedOnce = true;
            return;
          }
          const tasks = [];
          for (let skip = basePeopleParams.size; skip < needed; skip += basePeopleParams.size) {
            tasks.push(fetchPeoplePage(skip));
          }
          return Promise.allSettled(tasks).then(() => {
            peopleLoadedOnce = true;
            console.log('[SMAX] People cache ready:', peopleCache.size, '/', needed);
          });
        })
        .catch((err) => {
          console.warn('[SMAX] Failed to load people via API:', err);
        })
        .finally(() => {
          peopleLoadPromise = null;
        });
      return peopleLoadPromise;
    };
    const ensureSupportGroups = ({ force = false } = {}) => {
      if (supportGroupsLoadedOnce && !force) return Promise.resolve(getSupportGroupsSnapshot());
      if (supportGroupsLoadPromise) return supportGroupsLoadPromise;
      supportGroupsLoadPromise = fetchSupportGroupPage(0)
        .then((firstPage) => {
          const total = typeof supportGroupTotal === 'number'
            ? supportGroupTotal
            : ((firstPage && firstPage.meta && firstPage.meta.total_count) || supportGroupMap.size);
          if (!total || total <= supportGroupMap.size) {
            supportGroupsLoadedOnce = true;
            return getSupportGroupsSnapshot();
          }
          const tasks = [];
          for (let skip = supportGroupBaseParams.size; skip < total; skip += supportGroupBaseParams.size) {
            tasks.push(fetchSupportGroupPage(skip));
          }
          return Promise.allSettled(tasks).then(() => getSupportGroupsSnapshot());
        })
        .catch((err) => {
          console.warn('[SMAX] Failed to load support groups via API:', err);
          return getSupportGroupsSnapshot();
        })
        .finally(() => {
          supportGroupsLoadPromise = null;
          supportGroupsLoadedOnce = true;
        });
      return supportGroupsLoadPromise;
    };

    const ensureRequestPayload = (id, { force = false, layout = 'FULL_LAYOUT,RELATION_LAYOUT.item' } = {}) => {
      const key = String(id || '').replace(/\D/g, '') || String(id || '');
      if (!key) return Promise.resolve(null);
      const cachedValue = () => triageCache.get(key) || null;
      if (!force && triageCache.has(key)) return Promise.resolve(cachedValue());

      return ApiClient.request(`ems/Request/${encodeURIComponent(key)}`, {
        method: 'GET',
        searchParams: layout ? { layout } : undefined,
        includeTenantParam: true
      })
        .then((payload) => {
          ingestRequestDetailPayload(payload);
          return cachedValue();
        })
        .catch((err) => {
          console.warn('[SMAX] Failed to ensure triage payload:', err);
          return cachedValue();
        });
    };

    const defaultQueueParams = {
      layout: [
        'Id',
        'Description',
        'CreateTime',
        'Priority',
        'Solution',
        'RequestedForPerson.item',
        'RequestedForDisplayLabel',
        'RequestedForName',
        'ExpertGroup.item'
      ].join(','),
      order: 'CreateTime desc',
      size: 50,
      skip: 0
    };

    const refreshQueueFromApi = (params = {}) => {
      const searchParams = toQueryParams(defaultQueueParams, params);
      return ApiClient.request('ems/Request', {
        method: 'GET',
        searchParams,
        includeTenantParam: true
      })
        .then((payload) => {
          ingestRequestListPayload(payload);
          return payload;
        })
        .catch((err) => {
          console.warn('[SMAX] Failed to refresh queue via API:', err);
          throw err;
        });
    };

    // Ingere resposta de RequestCausesRequest (interceptada do SMAX UI)
    // firstEndpoint = pai (global), secondEndpoint = filho
    const ingestParentRelationshipPayload = (payload) => {
      try {
        const entities = payload?.entities || [];
        for (const ent of entities) {
          const props = ent?.properties || {};
          const firstRaw = String(props.firstEndpoint || props.FirstEndpoint || '').replace(/^IMRfc:/i, '').replace(/^IMchg:/i, '').trim();
          const secondRaw = String(props.secondEndpoint || props.SecondEndpoint || '').replace(/^IMRfc:/i, '').replace(/^IMchg:/i, '').trim();
          if (!firstRaw || !secondRaw || firstRaw === secondRaw) continue;
          // firstEndpoint é o pai → o filho (secondEndpoint) aponta para ele
          const existing = triageCache.get(secondRaw) || {};
          if (!existing.globalChangeId) {
            triageCache.set(secondRaw, Object.assign({}, existing, { globalChangeId: firstRaw }));
            console.log('[SMAX] RequestCausesRequest interceptado → filho', secondRaw, 'pai', firstRaw);
          }
        }
      } catch (err) {
        console.warn('[SMAX] ingestParentRelationshipPayload falhou:', err);
      }
    };

    // Busca o chamado pai (global) via relacionamento RequestCausesRequest
    // secondEndpoint = filho, firstEndpoint = pai (global)
    const fetchParentRequest = async (id) => {
      const key = String(id || '').replace(/\D/g, '') || String(id || '');
      if (!key) return null;
      // Se já temos, não busca de novo
      const cached = triageCache.get(key);
      if (cached?.globalChangeId) return cached.globalChangeId;
      try {
        const payload = await ApiClient.request('ems/RequestCausesRequest', {
          method: 'GET',
          searchParams: {
            filter: `(secondEndpoint='${key}')`,
            layout: 'firstEndpoint,secondEndpoint',
            size: 1
          },
          includeTenantParam: true
        });
        const entities = payload?.entities || [];
        if (!entities.length) return null;
        const props = entities[0]?.properties || {};
        const parentRaw = props.firstEndpoint || props.FirstEndpoint || '';
        const parentId = String(parentRaw).replace(/^IMRfc:/, '').replace(/^IMchg:/, '').trim();
        if (!parentId || parentId === key) return null;
        // Persiste no triageCache
        const existing = triageCache.get(key) || {};
        triageCache.set(key, Object.assign({}, existing, { globalChangeId: parentId }));
        console.log('[SMAX] RequestCausesRequest → chamado', key, 'tem pai global:', parentId);
        return parentId;
      } catch (err) {
        console.warn('[SMAX] fetchParentRequest falhou para', key, err);
        return null;
      }
    };

    const updateCachedSolution = (id, html) => {
      const key = String(id || '');
      if (!key || !triageCache.has(key)) return;
      const current = triageCache.get(key) || {};
      const safeHtml = html != null ? String(html) : '';
      const tmp = document.createElement('div');
      tmp.innerHTML = safeHtml;
      const text = (tmp.textContent || tmp.innerText || '').trim();
      triageCache.set(key, Object.assign({}, current, {
        solutionHtml: safeHtml,
        solutionText: text
      }));
    };

    const searchPeopleRemote = async (term) => {
      const q = (term || '').trim().replace(/'/g, '');
      if (!q || q.length < 3) return [];
      try {
        const payload = await ApiClient.request('ems/Person', {
          method: 'GET',
          searchParams: {
            filter: `(Name like '%${q}%')`,
            layout: 'Name,Upn,Email,FirstName,LastName,Title',
            size: '20',
            skip: '0',
            order: 'Name asc'
          },
          includeTenantParam: true
        });
        return (payload?.entities || [])
          .filter(e => e?.entity_type === 'Person')
          .map(e => { const p = e.properties || {}; return { id: p.Id != null ? String(p.Id) : '', name: (p.Name || '').toString().trim(), upn: (p.Upn || '').toString().trim() }; })
          .filter(p => p.id && p.name);
      } catch (err) { console.warn('[SMAX] Remote people search failed:', err); return []; }
    };

    return {
      triageCache,
      getTriageQueueSnapshot: () => triageIds.slice(),
      peopleCache,
      ingestRequestListPayload,
      ingestPersonListPayload,
      ensurePeopleLoaded,
      searchPeopleRemote,
      ensureSupportGroups,
      ensureRequestPayload,
      refreshQueueFromApi,
      upsertTriageEntryFromProps,
      ingestRequestDetailPayload,
      updateCachedSolution,
      fetchParentRequest,
      ingestParentRelationshipPayload,
      ingestSupportGroupPayload,
      getSupportGroupsSnapshot,
      onQueueUpdate: (fn) => {
        if (typeof fn === 'function') queueListeners.add(fn);
      },
      onPeopleUpdate: (fn) => {
        if (typeof fn !== 'function') return () => { };
        peopleListeners.add(fn);
        return () => peopleListeners.delete(fn);
      },
      onSupportGroupsUpdate: (fn) => {
        if (typeof fn !== 'function') return () => { };
        supportGroupListeners.add(fn);
        return () => supportGroupListeners.delete(fn);
      },
      resolveName: (personId) => {
        if (!personId) return '';
        const p = peopleCache.get(String(personId));
        return p?.name || p?.fullName || String(personId);
      },
      resolvePersonId: (name) => {
        const target = Utils.normalizeText(name);
        if (!target) return '';
        for (const person of peopleCache.values()) {
          if (!person) continue;
          const match = [
            person.name,
            [person.firstName, person.lastName].filter(Boolean).join(' '),
            person.DisplayLabel,
            person.FullName
          ].find((entry) => entry && Utils.normalizeText(entry) === target);
          if (match) return String(person.id);
        }
        return '';
      }
    };
  })();

  /* =========================================================
   * Network patch (intercept SMAX payloads)
   * =======================================================*/
  const Network = (() => {
    let patched = false;
    let _capturedPageFilter = null; // último filtro capturado da lista de chamados do SMAX
    // Regex pré-compiladas (evita recriar em cada interceptação)
    const RE_DETAIL     = /\/rest\/\d+\/ems\/Request\/\d+/i;
    const RE_LIST       = /\/rest\/\d+\/ems\/Request(?:\?|$)/i;
    const RE_EMS_ENTITY = /\/rest\/\d+\/ems\/(Request|Person|PersonGroup)/i;
    const RE_RCR        = /\/rest\/\d+\/ems\/RequestCausesRequest/i;
    const RE_PERSON     = /\/rest\/\d+\/ems\/Person/i;
    const RE_PGROUP     = /\/rest\/\d+\/ems\/PersonGroup/i;
    const isRequestDetailUrl = (url = '') => RE_DETAIL.test(url);
    const isRequestListUrl = (url = '') => RE_LIST.test(url) && !isRequestDetailUrl(url);

    const tryCapturePageFilter = (url = '') => {
      if (!isRequestListUrl(url)) return;
      try {
        const u = new URL(url, window.location.origin);
        const f = u.searchParams.get('filter');
        // Só captura se vier da página (não dos nossos próprios fetches identificados pelo layout)
        const layout = u.searchParams.get('layout') || '';
        if (f && !layout.includes('StatusSCCDSMAX_c')) {
          _capturedPageFilter = f;
          console.log('[SMAX] Filtro de lista capturado:', f.slice(0, 120));
        }
      } catch { }
    };

    const patch = () => {
      if (patched) return;
      patched = true;
      try {
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
          try { this.__smaxUrl = url; } catch { }
          return origOpen.call(this, method, url, ...rest);
        };
        XMLHttpRequest.prototype.send = function patchedSend(body) {
          this.addEventListener('load', function onLoad() {
            try {
              const url = this.__smaxUrl || this.responseURL || '';
              if (!RE_EMS_ENTITY.test(url)) return;
              tryCapturePageFilter(url);
              if (!this.responseText) return;
              const json = JSON.parse(this.responseText);
              if (RE_RCR.test(url)) {
                DataRepository.ingestParentRelationshipPayload(json);
              } else if (isRequestListUrl(url)) {
                DataRepository.ingestRequestListPayload(json);
              } else if (isRequestDetailUrl(url)) {
                DataRepository.ingestRequestDetailPayload(json);
              } else if (RE_PERSON.test(url)) {
                DataRepository.ingestPersonListPayload(json);
              } else if (RE_PGROUP.test(url)) {
                DataRepository.ingestSupportGroupPayload(json);
              }
            } catch { }
          });
          return origSend.call(this, body);
        };

        if (window.fetch) {
          const origFetch = window.fetch;
          window.fetch = function patchedFetch(input, init) {
            return origFetch(input, init).then((resp) => {
              try {
                const url = resp.url || (typeof input === 'string' ? input : '');
                if (!RE_EMS_ENTITY.test(url)) return resp;
                tryCapturePageFilter(url);
                const clone = resp.clone();
                clone.text().then((txt) => {
                  try {
                    if (!txt) return;
                    const json = JSON.parse(txt);
                    if (RE_RCR.test(url)) {
                      DataRepository.ingestParentRelationshipPayload(json);
                    } else if (isRequestListUrl(url)) {
                      DataRepository.ingestRequestListPayload(json);
                    } else if (isRequestDetailUrl(url)) {
                      DataRepository.ingestRequestDetailPayload(json);
                    } else if (RE_PERSON.test(url)) {
                      DataRepository.ingestPersonListPayload(json);
                    } else if (RE_PGROUP.test(url)) {
                      DataRepository.ingestSupportGroupPayload(json);
                    }
                  } catch { }
                });
              } catch { }
              return resp;
            });
          };
        }
      } catch (err) {
        console.warn('[SMAX] Failed to patch network:', err);
      }
    };

    const getCapturedPageFilter = () => _capturedPageFilter;
    return { patch, getCapturedPageFilter };
  })();

  Network.patch();

  /* =========================================================
   * API helpers for real updates
   * =======================================================*/
  const Api = (() => {
    const postUpdateRequest = (props) => {
      if (!prefs.enableRealWrites) {
        console.warn('[SMAX] Real writes disabled.');
        return Promise.resolve({ skipped: true, reason: 'real-writes-disabled' });
      }
      if (!props || !props.Id) {
        console.warn('[SMAX] postUpdateRequest missing Id.');
        return Promise.resolve(null);
      }
      const body = {
        entities: [{ entity_type: 'Request', properties: { ...props } }],
        operation: 'UPDATE'
      };
      return ApiClient.ems.bulk(body)
        .catch((err) => {
          console.warn('[SMAX] postUpdateRequest failed:', err);
          return null;
        });
    };

    const postCreateRequestCausesRequest = (globalId, childId) => {
      if (!prefs.enableRealWrites) {
        console.warn('[SMAX] Real writes disabled.');
        return Promise.resolve({ skipped: true, reason: 'real-writes-disabled' });
      }
      const parent = String(globalId || '').trim();
      const child = String(childId || '').trim();
      if (!parent || !child) {
        console.warn('[SMAX] Missing ids for RequestCausesRequest.');
        return Promise.resolve(null);
      }
      const body = {
        relationships: [{
          name: 'RequestCausesRequest',
          firstEndpoint: { Request: parent },
          secondEndpoint: { Request: child }
        }],
        operation: 'CREATE'
      };
      return ApiClient.ems.bulk(body)
        .catch((err) => {
          console.warn('[SMAX] postCreateRequestCausesRequest failed:', err);
          return null;
        });
    };

    const extractBulkErrorMessages = (response) => {
      if (!response) return ['SMAX não retornou resposta.'];
      if (response.skipped) return [];
      const messages = [];
      const pushMessage = (value) => {
        if (value == null) return;
        const text = String(value).trim();
        if (text) messages.push(text);
      };
      const harvest = (source) => {
        if (!source) return;
        if (Array.isArray(source)) {
          source.forEach((entry) => harvest(entry));
          return;
        }
        if (typeof source === 'object') {
          pushMessage(source.message || source.detail || source.description || source.text || source.errorMessage || source.reason);
          return;
        }
        pushMessage(source);
      };
      const meta = response.meta || {};
      harvest(meta.errorDetailsList);
      harvest(meta.errorDetails);
      harvest(meta.errorDetailsMetaList);
      harvest(meta.error_details_list);
      harvest(meta.error_details);
      harvest(response.errorDetailsList);
      harvest(response.errorDetails);
      pushMessage(meta.errorMessage || meta.error_message || meta.error);
      pushMessage(response.message || response.error);
      // Extrair erros por entidade do entity_result_list (detalhe real que meta omite)
      const entityResults = response.entity_result_list || response.entityResultList || [];
      if (Array.isArray(entityResults)) {
        entityResults.forEach(er => {
          if (er && typeof er === 'object') {
            harvest(er.errorDetails);
            harvest(er.errorDetailsList);
            harvest(er.error_details);
            if (!messages.length && er.completion_status && er.completion_status !== 'OK') {
              pushMessage(`Entity ${er.entity?.Id || ''}: ${er.completion_status}`);
            }
          }
        });
      }
      if (!messages.length && meta.completion_status && meta.completion_status !== 'OK') {
        pushMessage(`Status: ${meta.completion_status}`);
      }
      return messages;
    };

    const summarizeBulkOutcome = (payload, index = 0) => {
      if (payload && payload.skipped) return { ok: true, messages: [] };
      const errors = extractBulkErrorMessages(payload);
      const statusRaw = payload && payload.meta ? (payload.meta.completion_status || payload.meta.completionStatus) : '';
      const normalizedStatus = typeof statusRaw === 'string' ? statusRaw.toUpperCase() : '';
      const ok = normalizedStatus === 'OK' || (!normalizedStatus && !errors.length && !!payload);
      if (ok) return { ok: true, messages: [] };
      if (errors.length) return { ok: false, messages: errors };
      if (!payload) return { ok: false, messages: ['SMAX não retornou resposta.'] };
      return { ok: false, messages: [`Operação ${index + 1} falhou sem detalhes (status: ${normalizedStatus || 'desconhecido'}).`] };
    };

    // Converte PrivacyType da forma curta (leitura) para prefixada (escrita)
    const toSmaxPrivacyType = (raw) => {
      if (!raw) return 'PrivacyTypeInternal';
      if (raw.startsWith('PrivacyType')) return raw;
      const u = raw.toUpperCase();
      if (u === 'PUBLIC')   return 'PrivacyTypePublic';
      if (u === 'EXTERNAL') return 'PrivacyTypeExternal';
      if (u === 'AGENT')    return 'PrivacyTypeAgent';
      return 'PrivacyTypeInternal';
    };

    const postDiscussion = async (ticketId, { bodyHtml, purposeCode, privacyRaw, commentTo } = {}) => {
      if (!prefs.enableRealWrites) return { skipped: true };
      if (!ticketId || !bodyHtml) return null;

      // Buscar dados frescos do servidor: LastUpdateTime + comentários existentes
      let lastUpdateTime = 0;
      let existingComments = [];
      try {
        await DataRepository.ensureRequestPayload(String(ticketId), { force: true });
        const cached = DataRepository.triageCache.get(String(ticketId)) || {};
        lastUpdateTime = cached.lastUpdateTime || 0;
        existingComments = Array.isArray(cached.rawComments) ? cached.rawComments : [];
      } catch (err) {
        console.warn('[SMAX] postDiscussion: falha ao buscar ticket:', err);
      }

      // Gera CommentId no mesmo formato hex de 36 chars usado pelo SMAX
      const commentId = Array.from({ length: 36 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

      // Mapeia privacyRaw para o valor curto que o campo Comments aceita (PUBLIC/INTERNAL/etc.)
      const privacyShort = (() => {
        if (!privacyRaw) return 'INTERNAL';
        const u = privacyRaw.toUpperCase();
        if (u === 'PUBLIC')             return 'PUBLIC';
        if (u === 'EXTERNAL')           return 'EXTERNAL';
        if (u === 'AGENT')              return 'AGENT';
        if (u.startsWith('PRIVACYTYPE')) return u.replace('PRIVACYTYPE', '');
        return 'INTERNAL';
      })();

      const newComment = {
        CommentId: commentId,
        Submitter: prefs.myPersonId ? `Person/${prefs.myPersonId}` : '',
        CreateTime: Date.now(),
        UpdateTime: 0,
        IsSystem: false,
        ActualInterface: 'SAW',
        CommentMedia: 'UI',
        CommentFrom: 'Agent',
        FunctionalPurpose: purposeCode || 'StatusUpdate',
        PrivacyType: privacyShort,
        CommentTo: commentTo || 'Agent',
        CommentBody: bodyHtml,
        DeltaCreateTime: 1,
        AttachmentIds: ''
      };

      // Incluir TODOS os comentários existentes + o novo.
      // O SMAX faz REPLACE do campo Comments inteiro — se enviarmos apenas o novo,
      // os comentários de sistema seriam removidos e o servidor rejeita com
      // "Comentários do sistema não podem ser alterados" (systemCommentsValidation).
      const allComments = [...existingComments, newComment];
      let commentsJson = JSON.stringify({ Comment: allComments });

      // Se o payload exceder o limite seguro, reduzir tamanho substituindo base64 de imagens
      // de comentários antigos por um pixel transparente (o SMAX trunca campos Comments muito grandes).
      const COMMENTS_SAFE_LIMIT = 60000;
      if (commentsJson.length > COMMENTS_SAFE_LIMIT) {
        console.warn('[SMAX] postDiscussion: payload grande (' + commentsJson.length + ' chars), compactando imagens de comentários antigos.');
        const TINY_PX = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        const slimExisting = existingComments.map(c => {
          const body = c.CommentBody || '';
          if (body.length < 500) return c;
          return { ...c, CommentBody: body.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+\/=]{100,}/g, TINY_PX) };
        });
        commentsJson = JSON.stringify({ Comment: [...slimExisting, newComment] });
        console.info('[SMAX] postDiscussion: payload compactado →', commentsJson.length, 'chars');
      }
      const discProps = { Id: String(ticketId), Comments: commentsJson };
      if (lastUpdateTime) discProps.LastUpdateTime = lastUpdateTime;

      // Diagnóstico: logar tamanhos para detectar payloads que o SMAX possa truncar
      console.info('[SMAX] postDiscussion payload →', ticketId,
        '| bodyHtml:', bodyHtml.length, 'chars',
        '| existingComments:', existingComments.length,
        '| commentsJson:', commentsJson.length, 'chars');

      const body = {
        entities: [{ entity_type: 'Request', properties: discProps }],
        operation: 'UPDATE'
      };

      return ApiClient.ems.bulk(body).then(res => {
        if (res && res.meta && res.meta.completion_status !== 'OK') {
          console.warn('[SMAX] postDiscussion resultado:', res.meta.completion_status,
            'entity_result_list:', JSON.stringify((res.entity_result_list || []).map(e => ({ status: e.completion_status, error: e.errorDetails }))));
        }
        return res;
      }).catch(err => {
        console.warn('[SMAX] postDiscussion failed:', err);
        return null;
      });
    };

    /** Adiciona um seguidor (Person) a um chamado (Request) via relationship FollowedByUsers.
     *  Nome descoberto via captura de tráfego da UI nativa do SMAX TJSP. */
    const postAddFollower = async (ticketId, personId) => {
      if (!prefs.enableRealWrites) {
        console.warn('[SMAX] Real writes disabled.');
        return { skipped: true, reason: 'real-writes-disabled' };
      }
      const ticket = String(ticketId || '').trim();
      const person = String(personId || '').trim();
      if (!ticket || !person) {
        console.warn('[SMAX] Missing ids for addFollower.');
        return null;
      }

      // Tenta ambas as ordens de endpoint (a relação FollowedByUsers pode ser
      // definida com Request como first ou Person como first, dependendo do modelo).
      const attempts = [
        { firstEndpoint: { Request: ticket }, secondEndpoint: { Person: person } },
        { firstEndpoint: { Person: person }, secondEndpoint: { Request: ticket } }
      ];

      for (const endpoints of attempts) {
        try {
          const body = {
            relationships: [{
              name: 'FollowedByUsers',
              ...endpoints
            }],
            operation: 'CREATE'
          };
          const res = await ApiClient.ems.bulk(body);
          const outcome = summarizeBulkOutcome(res);
          if (outcome?.ok) {
            console.info('[SMAX] postAddFollower OK via FollowedByUsers:', ticket, '→', person);
            return res;
          }
          const detail = res?.relationship_result_list?.[0]?.errorDetails?.message || '';
          console.warn('[SMAX] postAddFollower FollowedByUsers tentativa:', JSON.stringify(endpoints), '→', detail || JSON.stringify(res));
        } catch (err) {
          console.warn('[SMAX] postAddFollower HTTP error:', err.message);
        }
      }

      console.error('[SMAX] postAddFollower: falhou para ticket', ticket, 'pessoa', person);
      return null;
    };

    /** Remove um seguidor (Person) de um chamado (Request) via relationship FollowedByUsers. */
    const postRemoveFollower = async (ticketId, personId) => {
      if (!prefs.enableRealWrites) return { skipped: true, reason: 'real-writes-disabled' };
      const ticket = String(ticketId || '').trim();
      const person = String(personId || '').trim();
      if (!ticket || !person) return null;
      const attempts = [
        { firstEndpoint: { Request: ticket }, secondEndpoint: { Person: person } },
        { firstEndpoint: { Person: person }, secondEndpoint: { Request: ticket } }
      ];
      for (const endpoints of attempts) {
        try {
          const body = { relationships: [{ name: 'FollowedByUsers', ...endpoints }], operation: 'DELETE' };
          const res = await ApiClient.ems.bulk(body);
          const outcome = summarizeBulkOutcome(res);
          if (outcome?.ok) {
            console.info('[SMAX] postRemoveFollower OK:', ticket, '→', person);
            return res;
          }
        } catch (err) { console.warn('[SMAX] postRemoveFollower error:', err.message); }
      }
      console.error('[SMAX] postRemoveFollower: falhou para ticket', ticket, 'pessoa', person);
      return null;
    };

    return { postUpdateRequest, postCreateRequestCausesRequest, postDiscussion, postAddFollower, postRemoveFollower, extractBulkErrorMessages, summarizeBulkOutcome };
  })();

  /* =========================================================
   * Attachment fetcher + preview
   * =======================================================*/
  const AttachmentService = (() => {
    const cache = new Map();
    const inflight = new Map();

    const normalizeCacheKey = (value) => Utils.normalizeRequestId(value);

    const formatParentReference = (value) => {
      const normalized = normalizeCacheKey(value);
      if (!normalized) return '';
      return /^Request:/i.test(normalized) ? normalized : `Request:${normalized}`;
    };

    const uniqueList = (list) => [...new Set((list || []).filter(Boolean))];

    const isTruthyFlag = (value) => {
      if (typeof value === 'string') return value.toLowerCase() === 'true';
      return Boolean(value);
    };

    const pickAttachmentLabel = (entry) => {
      if (!entry) return '';
      const candidates = [
        entry.file_name,
        entry.FileName,
        entry.DownloadFileName,
        entry.name,
        entry.Name
      ];
      for (const candidate of candidates) {
        if (candidate == null) continue;
        const trimmed = String(candidate).trim();
        if (trimmed) return trimmed;
      }
      return '';
    };

    const shouldSkipAttachmentProps = (props) => {
      if (!props) return true;
      const hiddenFlag = props.IsHidden ?? props.isHidden;
      if (isTruthyFlag(hiddenFlag)) return true;
      const label = pickAttachmentLabel(props);
      if (!label) return true;
      if (/^text-editor-img/i.test(label)) return true;
      return false;
    };

    const buildFrsFileUrl = (attachmentId, { size, draftMode } = {}) => {
      const normalized = Utils.normalizeAttachmentId(attachmentId) || attachmentId;
      if (!normalized) return '';
      const params = new URLSearchParams();
      if (size != null && size !== '') params.set('s', size);
      if (draftMode) params.set('draftMode', 'true');
      const query = params.toString();
      return `/rest/${SMAX_TENANT_ID}/frs/file-list/${encodeURIComponent(normalized)}${query ? `?${query}` : ''}`;
    };

    const buildDownloadCandidates = (id, fileList = [], context = {}) => {
      const normalizedId = Utils.normalizeAttachmentId(id);
      if (!normalizedId) return [];
      const attachmentVariants = uniqueList([normalizedId, `Attachment:${normalizedId}`]);
      const parentId = normalizeCacheKey(context.parentId);
      const sizeHint = context.sizeHint != null ? context.sizeHint : context.sizeParam;
      const candidates = [];

      if (Array.isArray(fileList) && fileList.length) {
        fileList.forEach((entry) => {
          const direct = entry?.href || entry?.url || entry?.link;
          if (direct) candidates.push(Utils.toAbsoluteUrl(direct));
        });
      }

      const frsDirect = buildFrsFileUrl(normalizedId, { size: sizeHint });
      if (frsDirect) candidates.push(frsDirect);
      const frsDraft = buildFrsFileUrl(normalizedId, { size: sizeHint, draftMode: true });
      if (frsDraft) candidates.push(frsDraft);

      attachmentVariants.forEach((variant) => {
        if (parentId) {
          const params = new URLSearchParams({ attachmentId: variant });
          if (context.fileNameParam) params.append('fileName', context.fileNameParam);
          candidates.push(`/rest/${SMAX_TENANT_ID}/entity-page/attachment/Request/${encodeURIComponent(parentId)}?${params.toString()}`);
        }
        candidates.push(`/rest/${SMAX_TENANT_ID}/entity-page/attachment/Attachment/${encodeURIComponent(variant)}`);
        candidates.push(`/rest/${SMAX_TENANT_ID}/entity-page/attachment/Attachment/${encodeURIComponent(variant)}?attachmentId=${encodeURIComponent(variant)}`);
        candidates.push(`/rest/${SMAX_TENANT_ID}/ems/file-list/Attachment/${encodeURIComponent(variant)}`);
      });

      return uniqueList(candidates);
    };
    const buildDefaultHeaders = () => {
      const headers = { Accept: 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' };
      const xsrfMatch = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
      if (xsrfMatch) headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrfMatch[1]);
      return headers;
    };

    const toAttachmentRecord = ({ id, name, mime, size, extension, fileList, context = {} }) => {
      const safeId = (id != null ? String(id) : '').trim();
      if (!safeId) return null;
      const label = (name || `Anexo ${safeId}`).toString();
      const lower = label.toLowerCase();
      const ext = (extension || (lower.includes('.') ? lower.split('.').pop() : '') || '').toLowerCase();
      const mimeType = (mime || '').toLowerCase();
      const downloadCandidates = buildDownloadCandidates(
        safeId,
        fileList,
        Object.assign({}, context, {
          fileNameParam: context.fileNameParam || label,
          sizeHint: context.sizeHint != null ? context.sizeHint : size
        })
      );
      if (!downloadCandidates.length) return null;
      const isPdf = mimeType.includes('pdf') || ext === 'pdf';
      const isImage = mimeType.startsWith('image/') || /^(png|jpe?g|gif|bmp|webp|svg)$/i.test(ext);
      return {
        id: safeId,
        name: label,
        mimeType,
        size: Number(size) || 0,
        extension: ext,
        downloadUrl: downloadCandidates[0],
        downloadCandidates,
        parentId: context.parentId ? normalizeCacheKey(context.parentId) : '',
        isPdf,
        isImage
      };
    };

    const parseAttachmentEntities = (payload, { parentId } = {}) => {
      const entities = Array.isArray(payload?.entities) ? payload.entities : [];
      const normalized = [];
      entities.forEach((entity) => {
        const props = entity?.properties || {};
        if (shouldSkipAttachmentProps(props)) return;
        const record = toAttachmentRecord({
          id: props.Id != null ? props.Id : (entity?.entity_id || null),
          name: pickAttachmentLabel(props),
          mime: props.MimeType || props.ContentType,
          size: props.FileSize || props.Size,
          extension: props.FileExtension,
          fileList: props.file_list || props.FileList || entity?.file_list || [],
          context: { parentId }
        });
        if (record) normalized.push(record);
      });
      return normalized;
    };

    const parseRequestAttachmentValue = (value, { requestId } = {}) => {
      if (!value) return [];
      let payload = value;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (err) {
          console.warn('[SMAX] Failed to parse RequestAttachments JSON:', err);
          return [];
        }
      }
      let list = [];
      if (Array.isArray(payload?.complexTypeProperties)) {
        list = payload.complexTypeProperties.map((item) => (item && item.properties) ? item.properties : item);
      } else if (Array.isArray(payload)) {
        list = payload;
      } else if (payload && typeof payload === 'object') {
        list = payload.properties ? [payload.properties] : [];
      }
      const normalized = [];
      list.forEach((entry) => {
        if (!entry) return;
        if (shouldSkipAttachmentProps(entry)) return;
        const record = toAttachmentRecord({
          id: entry.id || entry.Id,
          name: pickAttachmentLabel(entry),
          mime: entry.mime_type || entry.MimeType || entry.content_type,
          size: entry.size || entry.FileSize,
          extension: entry.file_extension || entry.FileExtension,
          fileList: entry.file_list || entry.FileList || [],
          context: { parentId: requestId }
        });
        if (record) normalized.push(record);
      });
      return normalized;
    };

    const fetchViaAttachmentEntity = (requestId) => {
      const parentRef = formatParentReference(requestId);
      const filter = encodeURIComponent(`ParentEntity.Id = "${parentRef}"`);
      const layout = encodeURIComponent('Id,Name,FileName,MimeType,FileSize,file_list');
      const url = `/rest/${SMAX_TENANT_ID}/ems/Attachment?filter=${filter}&layout=${layout}`;
      return fetch(url, { method: 'GET', credentials: 'include', headers: buildDefaultHeaders() })
        .then((r) => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then((txt) => {
          if (!txt) return [];
          try {
            return parseAttachmentEntities(JSON.parse(txt), { parentId: requestId });
          } catch (err) {
            console.warn('[SMAX] Failed to parse attachment payload:', err);
            return [];
          }
        })
        .catch((err) => {
          console.warn('[SMAX] Attachment entity lookup failed:', err);
          return [];
        });
    };

    const fetchViaEntityPage = (requestId) => {
      const normalizedId = normalizeCacheKey(requestId);
      if (!normalizedId) return Promise.resolve(null);
      const layoutParam = encodeURIComponent('FORM_LAYOUT.withoutResolution,FORM_LAYOUT.onlyResolution');
      const url = `/rest/${SMAX_TENANT_ID}/entity-page/initializationDataByLayout/Request/${encodeURIComponent(normalizedId)}?layout=${layoutParam}`;
      return fetch(url, { method: 'GET', credentials: 'include', headers: buildDefaultHeaders() })
        .then((r) => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then((txt) => {
          if (!txt) return [];
          try {
            const payload = JSON.parse(txt);
            const attachmentsRaw = payload?.EntityData?.properties?.RequestAttachments;
            return parseRequestAttachmentValue(attachmentsRaw, { requestId: normalizedId });
          } catch (err) {
            console.warn('[SMAX] Failed to parse initializationData attachments:', err);
            return [];
          }
        })
        .catch((err) => {
          console.warn('[SMAX] initializationData attachment lookup failed:', err);
          return null;
        });
    };

    const fetchList = (requestId) => {
      const cacheKey = normalizeCacheKey(requestId);
      if (!cacheKey) return Promise.resolve([]);
      if (cache.has(cacheKey)) return Promise.resolve(cache.get(cacheKey));
      if (inflight.has(cacheKey)) return inflight.get(cacheKey);

      const promise = fetchViaEntityPage(requestId)
        .then((list) => (list !== null ? list : fetchViaAttachmentEntity(requestId)))
        .then((list) => {
          const safeList = Array.isArray(list) ? list : [];
          cache.set(cacheKey, safeList);
          inflight.delete(cacheKey);
          return safeList;
        })
        .catch((err) => {
          inflight.delete(cacheKey);
          console.warn('[SMAX] Failed to load attachments for', requestId, err);
          cache.set(cacheKey, []);
          return [];
        });

      inflight.set(cacheKey, promise);
      return promise;
    };

    const fetchAttachmentMetadata = async (attachmentId) => {
      const normalizedId = Utils.normalizeAttachmentId(attachmentId);
      if (!normalizedId) return null;
      const variants = uniqueList([normalizedId, `Attachment:${normalizedId}`]);
      for (const variant of variants) {
        const url = `/rest/${SMAX_TENANT_ID}/ems/Attachment/${encodeURIComponent(variant)}?layout=Id,Name,FileName,file_list,FileList`;
        try {
          const resp = await fetch(url, { method: 'GET', credentials: 'include', headers: buildDefaultHeaders() });
          if (!resp.ok) continue;
          const txt = await resp.text();
          if (!txt) continue;
          const parsed = JSON.parse(txt);
          const entity = Array.isArray(parsed?.entities) ? parsed.entities[0] : null;
          if (!entity) continue;
          const props = entity.properties || {};
          const fileList = props.file_list || props.FileList || entity.file_list || entity.FileList;
          if (Array.isArray(fileList) && fileList.length) {
            return { fileList };
          }
        } catch (err) {
          console.warn('[SMAX] Failed to resolve attachment metadata for', variant, err);
        }
      }
      return null;
    };

    const ensureDownloadCandidates = async (attachment) => {
      if (!attachment) return [];
      const existing = Array.isArray(attachment.downloadCandidates) ? attachment.downloadCandidates.filter(Boolean) : [];
      if (existing.length) return existing;
      if (attachment._resolvingCandidates) return attachment._resolvingCandidates;

      attachment._resolvingCandidates = (async () => {
        const metadata = await fetchAttachmentMetadata(attachment.id);
        if (metadata && Array.isArray(metadata.fileList)) {
          const extra = buildDownloadCandidates(attachment.id, metadata.fileList, { parentId: attachment.parentId, fileNameParam: attachment.name });
          if (extra.length) {
            attachment.downloadCandidates = extra;
            attachment.downloadUrl = extra[0];
            return extra;
          }
        }
        return [];
      })()
        .catch((err) => {
          console.warn('[SMAX] Failed to fetch attachment download list:', err);
          return [];
        })
        .finally(() => {
          attachment._resolvingCandidates = null;
        });

      const resolved = await attachment._resolvingCandidates;
      return Array.isArray(resolved) ? resolved : [];
    };

    const AttachmentPreviewer = (() => {
      let modal, img, caption, closeBtn, prevBtn, nextBtn;
      let activeObjectUrl = '';
      let currentList = [];
      let currentIndex = -1;

      const ensureModal = () => {
        if (modal) return;
        modal = document.createElement('div');
        modal.id = 'smax-attachment-modal';
        img = document.createElement('img');
        caption = document.createElement('div');
        caption.className = 'smax-attachment-caption';
        closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '✖';
        closeBtn.addEventListener('click', hideModal);
        // Nav buttons
        prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'smax-attachment-nav smax-attachment-nav-prev';
        prevBtn.textContent = '‹';
        prevBtn.addEventListener('click', (e) => { e.stopPropagation(); navigate(-1); });
        nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'smax-attachment-nav smax-attachment-nav-next';
        nextBtn.textContent = '›';
        nextBtn.addEventListener('click', (e) => { e.stopPropagation(); navigate(1); });
        modal.appendChild(closeBtn);
        modal.appendChild(prevBtn);
        modal.appendChild(img);
        modal.appendChild(nextBtn);
        modal.appendChild(caption);
        modal.addEventListener('click', (evt) => {
          if (evt.target === modal) hideModal();
        });
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
          if (!modal || modal.dataset.visible !== 'true') return;
          if (e.key === 'ArrowLeft') navigate(-1);
          else if (e.key === 'ArrowRight') navigate(1);
          else if (e.key === 'Escape') hideModal();
        });
        document.body.appendChild(modal);
      };

      const updateNavState = () => {
        if (!prevBtn || !nextBtn) return;
        const hasNav = currentList.length > 1;
        prevBtn.style.display = hasNav ? '' : 'none';
        nextBtn.style.display = hasNav ? '' : 'none';
      };

      const hideModal = () => {
        if (!modal) return;
        modal.dataset.visible = 'false';
        if (activeObjectUrl) {
          URL.revokeObjectURL(activeObjectUrl);
          activeObjectUrl = '';
        }
        currentList = [];
        currentIndex = -1;
      };

      const showImage = (objectUrl, title) => {
        ensureModal();
        if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
        activeObjectUrl = objectUrl;
        img.src = objectUrl;
        const indexLabel = currentList.length > 1 ? `${currentIndex + 1}/${currentList.length} — ` : '';
        caption.textContent = indexLabel + (title || '');
        modal.dataset.visible = 'true';
        updateNavState();
      };

      const navigate = async (delta) => {
        if (currentList.length < 2) return;
        const newIdx = (currentIndex + delta + currentList.length) % currentList.length;
        currentIndex = newIdx;
        const att = currentList[newIdx];
        try {
          const { objectUrl } = await fetchBlobUrl(att);
          showImage(objectUrl, att.name);
        } catch (err) {
          caption.textContent = 'Erro ao carregar: ' + err.message;
        }
      };

      const openPdf = async (blobUrl) => {
        const win = window.open(blobUrl, '_blank');
        if (!win) {
          alert('Pop-up bloqueado ao abrir PDF. Permita pop-ups para esta página.');
          URL.revokeObjectURL(blobUrl);
          return;
        }
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      };

      const fetchBlobUrl = async (attachment) => {
        const gatherCandidates = async () => {
          const initial = Array.isArray(attachment?.downloadCandidates) ? attachment.downloadCandidates.filter(Boolean) : [];
          if (initial.length) return initial;
          await ensureDownloadCandidates(attachment);
          return Array.isArray(attachment?.downloadCandidates) ? attachment.downloadCandidates.filter(Boolean) : [];
        };

        const resolved = await gatherCandidates();
        const candidates = resolved.length
          ? resolved
          : (attachment?.downloadUrl ? [attachment.downloadUrl] : []);

        if (!candidates.length) throw new Error('Não consegui localizar o arquivo deste anexo.');
        let lastError;
        for (const url of candidates) {
          try {
            const resp = await fetch(url, { credentials: 'include' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const blob = await resp.blob();
            return { objectUrl: URL.createObjectURL(blob), sourceUrl: url };
          } catch (err) {
            lastError = err;
          }
        }
        throw lastError || new Error('Não consegui baixar este anexo.');
      };

      const open = async (attachment, list) => {
        if (!attachment || (!attachment.downloadUrl && !attachment.downloadCandidates)) {
          alert('Não consegui localizar o arquivo deste anexo.');
          return;
        }
        // Set up list navigation for images
        if (list && list.length > 0 && attachment.isImage) {
          currentList = list.filter(a => a.isImage);
          currentIndex = currentList.findIndex(a => a === attachment || a.name === attachment.name);
          if (currentIndex < 0) currentIndex = 0;
        } else {
          currentList = [];
          currentIndex = -1;
        }
        try {
          if (attachment.isImage) {
            const { objectUrl } = await fetchBlobUrl(attachment);
            showImage(objectUrl, attachment.name);
            return;
          }
          if (attachment.isPdf) {
            const { objectUrl } = await fetchBlobUrl(attachment);
            await openPdf(objectUrl);
            return;
          }
          const { objectUrl } = await fetchBlobUrl(attachment);
          Utils.triggerFileDownload(objectUrl, attachment.name);
        } catch (err) {
          alert('Erro ao abrir anexo: ' + err.message);
        }
      };

      return { open };
    })();

    const preview = (attachment, list) => AttachmentPreviewer.open(attachment, list);

    return { fetchList, preview };
  })();


  /* =========================================================
   * Settings panel
   * =======================================================*/
  const SettingsPanel = (() => {
    let container;
    let toggleBtn;
    let detachPeopleWatcher;
    let currentTeams = []; // Local state for editing
    let _openPanel = null; // populated in init()
    let editingTeamId = null; // ID of team currently being edited ('__NEW__' for new team)
    let activeSection = 'geral'; // current sidebar section

    const SECTIONS = [
      { id: 'geral',         icon: '⚙️',  label: 'Geral' },
      { id: 'equipes',       icon: '👥',  label: 'Equipes' },
      { id: 'especialistas', icon: '👤',  label: 'Especialistas' },
      { id: 'triagem',       icon: '🎯',  label: 'Triagem' },
      { id: 'assinaturas',   icon: '✒️',  label: 'Assinaturas' },
    ];

    // Load fresh config from prefs — shared teams are excluded from editing
    const reloadConfig = () => {
      currentTeams = TeamsConfig.getTeams()
        .filter(t => !t._shared)
        .map(t => JSON.parse(JSON.stringify(t)));
    };

    const saveConfig = () => {
      // Never persist shared teams (_shared: true) into local storage
      prefs.teamsConfigRaw = JSON.stringify(currentTeams.filter(t => !t._shared), null, 2);
      savePrefs();
      TeamsConfig.reload();
    };

    const renderHeader = () => {
      const isDark = (personal.themeMode || 'dark') === 'dark';
      return `
      <div id="smax-settings-header" style="display:flex;align-items:center;justify-content:space-between;min-height:52px;padding:10px 18px;background:var(--sp-header-bg);border-radius:0;flex-shrink:0;gap:12px;">
        <div style="font-weight:700;font-size:16px;letter-spacing:.03em;color:var(--sp-header-fg);text-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap;">
          ⚙️ SMAX Toolkit
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button id="smax-theme-toggle-btn"
            title="${isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}"
            style="border:none;background:var(--sp-header-btn);color:var(--sp-header-fg);font-size:17px;width:34px;height:34px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s ease;flex-shrink:0;">
            ${isDark ? '☀️' : '🌙'}
          </button>
          <button id="smax-settings-close-btn"
            title="Fechar"
            style="border:none;background:var(--sp-header-btn);color:var(--sp-header-fg);font-size:18px;width:34px;height:34px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s ease;flex-shrink:0;">
            ✕
          </button>
        </div>
      </div>`;
    };

    const renderSidebar = () => `
      <nav id="smax-settings-sidebar" style="width:190px;flex-shrink:0;background:var(--sp-sidebar-bg);border-right:1px solid var(--sp-border);padding:12px 8px;display:flex;flex-direction:column;gap:2px;overflow-y:auto;">
        <div style="font-size:10px;font-weight:600;color:var(--sp-text-dim);text-transform:uppercase;letter-spacing:.08em;padding:4px 8px 8px;">Navegação</div>
        ${SECTIONS.map(s => `
          <button class="smax-sidebar-item${s.id === activeSection ? ' active' : ''}" data-section="${s.id}">
            <span style="font-size:15px;flex-shrink:0;">${s.icon}</span>
            <span>${s.label}</span>
          </button>
        `).join('')}
      </nav>`;

    // --- Team Editor Methods ---

    const renderTeamsList = () => {
      if (editingTeamId) return renderTeamEditor(editingTeamId);

      const allTeams = [
        ...currentTeams,
        ...TeamsConfig.getTeams().filter(t => t._shared),
      ];
      const listHtml = allTeams.map(t => {
        const isDefault = !!t.isDefault;
        const isShared = !!t._shared;
        return `
          <div class="smax-team-item" style="border:1px solid ${isShared ? 'var(--sp-pending)' : 'var(--sp-border)'};border-radius:10px;padding:10px 12px;margin-bottom:8px;background:${isShared ? 'var(--sp-pending-bg)' : 'var(--sp-surface-2)'};transition:border-color .15s ease,box-shadow .15s ease;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <strong style="font-size:13px;color:var(--sp-text);">${Utils.escapeHtml(t.name || t.id || 'Sem nome')}</strong>
                ${isDefault ? '<span style="font-size:10px;background:var(--sp-primary-bg);color:var(--sp-accent);padding:2px 6px;border-radius:999px;margin-left:6px;border:1px solid var(--sp-accent);">Padrão</span>' : ''}
                ${isShared ? '<span style="font-size:10px;background:var(--sp-pending-bg);color:var(--sp-pending);padding:2px 6px;border-radius:999px;margin-left:6px;border:1px solid var(--sp-pending);" title="Carregada do Config. Compartilhada — somente leitura">☁️ Compartilhada</span>' : ''}
                <div class="smax-team-prio-info" style="font-size:11px;color:var(--sp-text-muted);margin-top:2px;">Prioridade: ${t.priority || 0} • Membros: ${t.workers ? t.workers.length : 0}</div>
              </div>
              <div style="display:flex;gap:6px;">
                ${!isShared ? `<button class="smax-team-edit-btn" data-id="${t.id}" style="font-size:11px;padding:6px 12px;cursor:pointer;background:var(--sp-surface);color:var(--sp-text);border:1px solid var(--sp-border);border-radius:6px;transition:all .15s ease;">Editar</button>` : ''}
                ${!isDefault && !isShared ? `<button class="smax-team-del-btn" data-id="${t.id}" style="font-size:11px;padding:6px 12px;cursor:pointer;color:var(--sp-danger);background:var(--sp-danger-bg);border:1px solid var(--sp-danger-border);border-radius:6px;transition:all .15s ease;">Remover</button>` : ''}
                ${isShared ? '<span style="font-size:11px;color:var(--sp-text-muted);padding:6px 8px;">somente leitura</span>' : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="margin-top:16px;border-top:1px solid var(--sp-border);padding-top:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span style="font-weight:600;color:var(--sp-text);font-size:14px;">Equipes e Regras</span>
            <button id="smax-add-team-btn" style="font-size:12px;padding:6px 14px;cursor:pointer;background:var(--sp-accent);color:var(--sp-on-accent);border:none;border-radius:8px;">+ Nova Equipe</button>
          </div>
          <div id="smax-teams-list-container">${listHtml}</div>
        </div>
      `;
    };

    const renderTeamEditor = (teamId) => {
      const isNew = teamId === '__NEW__';
      const team = isNew ? { id: '', priority: 0, gseRules: [], workers: [] } : currentTeams.find(t => t.id === teamId);
      if (!team) return '<div>Equipe não encontrada. <button class="smax-cancel-edit">Voltar</button></div>';

      const isGeneralTeam = team.id === 'geral';
      const gseHtml = (team.gseRules || []).map((r, idx) => `
        <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">
          <input type="hidden" class="smax-gse-id" value="${Utils.escapeHtml(r.id)}">
          <input type="text" class="smax-gse-name" value="${Utils.escapeHtml(r.name || r.id)}" disabled style="flex:1;font-size:11px;padding:6px;border:1px solid var(--sp-border);border-radius:6px;background:var(--sp-surface-2);color:var(--sp-text-muted);opacity:.8;">
          <button class="smax-gse-del-btn" style="color:var(--sp-danger-text);border:1px solid var(--sp-danger-border);background:var(--sp-danger-bg);padding:4px 8px;border-radius:4px;cursor:pointer;">✕</button>
        </div>
      `).join('');

      const matcherRowHtml = (m) => {
        const displayText = m._displayText || m.pattern || '';
        const scope = m.scope || 'location';
        return `
          <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;background:var(--sp-surface-2);border:1px solid var(--sp-border);padding:6px 8px;border-radius:8px;">
            <input type="hidden" class="smax-matcher-pattern" value="${Utils.escapeHtml(m.pattern || '')}">
            <input type="hidden" class="smax-matcher-scope" value="${Utils.escapeHtml(scope)}">
            <span style="flex:1;font-size:11px;color:var(--sp-text-muted);">contém: <strong style="color:var(--sp-text);">${Utils.escapeHtml(displayText)}</strong></span>
            <button class="smax-matcher-del-btn" style="color:var(--sp-danger-text);border:1px solid var(--sp-danger-border);background:var(--sp-danger-bg);padding:4px 8px;border-radius:4px;cursor:pointer;">✕</button>
          </div>`;
      };
      const locationMatchersHtml = (team.matchers || []).filter(m => m.type === 'regex' && (m.scope || 'location') === 'location').map(matcherRowHtml).join('');
      const textMatchersHtml    = (team.matchers || []).filter(m => m.type === 'regex' && m.scope === 'text').map(matcherRowHtml).join('');

      const workersHtml = (team.workers || []).map((w, idx) => {
        const normName = Utils.normalizeText(w.name || '');
        return `
        <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;background:var(--sp-surface-2);border:1px solid var(--sp-border);padding:8px;border-radius:8px;flex-wrap:wrap;">
          <input type="text" class="smax-worker-name" data-idx="${idx}" value="${Utils.escapeHtml(w.name || '')}" style="flex:1;min-width:120px;font-size:11px;padding:6px;border:1px solid var(--sp-border);border-radius:6px;background:var(--sp-input-bg);color:var(--sp-text);" placeholder="Nome do Responsável">
          <input type="text" class="smax-worker-digits" data-idx="${idx}" value="${Utils.escapeHtml(w.digits || '')}" style="width:80px;font-size:11px;padding:6px;border:1px solid var(--sp-border);border-radius:6px;background:var(--sp-input-bg);color:var(--sp-text);" placeholder="Dígitos (ex: 0-9)">
          <div class="smax-worker-absent-wrapper" style="display:flex;align-items:center;cursor:pointer;user-select:none;">
             <input type="checkbox" class="smax-worker-absent" data-idx="${idx}" ${w.isAbsent ? 'checked' : ''} style="display:none;">
             <div class="smax-absent-fake" style="width:14px;height:14px;border:1px solid ${w.isAbsent ? 'var(--sp-danger)' : 'var(--sp-border)'};margin-right:4px;background:${w.isAbsent ? 'var(--sp-danger)' : 'transparent'};border-radius:2px;display:flex;align-items:center;justify-content:center;"></div>
             <span style="font-size:10px;color:var(--sp-danger-text);">Ausente</span>
          </div>
          <button class="smax-worker-del-btn" data-idx="${idx}" style="color:var(--sp-danger-text);border:1px solid var(--sp-danger-border);background:var(--sp-danger-bg);padding:4px 8px;border-radius:4px;cursor:pointer;">✕</button>
        </div>
      `; }).join('');

      return `
        <div style="margin-top:16px;border:1px solid var(--sp-border);padding:14px;border-radius:12px;background:var(--sp-surface);">
          <div style="font-weight:600;margin-bottom:12px;color:var(--sp-accent);font-size:15px;">${isNew ? '✨ Criar Nova Equipe' : '✏️ Editar Equipe ' + team.id}</div>

          <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-bottom:12px;">
            <div>
              <label style="display:block;font-size:12px;font-weight:600;color:var(--sp-text-muted);margin-bottom:4px;">Qual o nome da equipe?</label>
              <input type="text" id="smax-edit-id" value="${Utils.escapeHtml(team.name || team.id || '')}" ${isGeneralTeam ? 'disabled' : ''} placeholder="Ex: JEC, Cível, Criminal..." style="width:100%;padding:8px 12px;border:1px solid var(--sp-border);border-radius:8px;background:var(--sp-input-bg);color:var(--sp-text);font-size:13px;box-sizing:border-box;${isGeneralTeam ? 'opacity:.6;cursor:not-allowed;' : ''}">
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:600;color:var(--sp-text-muted);margin-bottom:2px;">Prioridade
                <span title="Define a ordem de verificação na triagem automática. A equipe com maior prioridade é verificada primeiro. Use valores altos (ex: 10) para equipes específicas e baixos (ex: 1) para a equipe geral (fallback). Assim, chamados de um GSE específico vão para a equipe certa antes de cair no grupo geral." style="cursor:help;margin-left:4px;font-size:11px;color:var(--sp-text-dim);font-weight:400;">ℹ️</span>
              </label>
              <input type="number" id="smax-edit-prio" value="${team.priority || 0}" style="width:100%;padding:8px 12px;border:1px solid var(--sp-border);border-radius:8px;background:var(--sp-input-bg);color:var(--sp-text);font-size:13px;box-sizing:border-box;">
            </div>
          </div>

          <div style="margin-bottom:12px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:4px;color:var(--sp-text);">Quais GSE a equipe atende?
              <span title="GSE = Grupo de Suporte Especializado (ExpertGroup no SMAX). Chamados atribuídos a esses grupos serão roteados automaticamente para esta equipe na triagem. Também são usados como filtro na janela de Consulta de Chamados." style="cursor:help;margin-left:4px;font-size:11px;color:var(--sp-text-dim);font-weight:400;">ℹ️</span>
            </div>
            ${isGeneralTeam ? '<div style="font-size:11px;color:var(--sp-text-muted);margin-bottom:8px;">⚠️ A equipe GERAL não permite edição de GSEs (aceita todos os grupos).</div>' : `
            <div style="margin-bottom:8px;border:1px solid var(--sp-border);background:var(--sp-surface-2);border-radius:8px;padding:8px;">
              <input type="text" id="smax-team-gse-search" placeholder="🔍 Buscar GSE para adicionar..."
                     style="width:100%;padding:6px 10px;border:1px solid var(--sp-border);border-radius:6px;font-size:12px;margin-bottom:4px;background:var(--sp-input-bg);color:var(--sp-text);box-sizing:border-box;">
              <div id="smax-team-gse-results" style="max-height:100px;overflow-y:auto;border-top:1px solid var(--sp-border);display:none;background:var(--sp-surface);"></div>
            </div>
            <div id="smax-gse-list">${gseHtml}</div>`}
          </div>

          <div style="margin-bottom:12px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:4px;color:var(--sp-text);">Palavras-chave para roteamento
              <span title="Rota alternativa ao GSE: quando o chamado não bate com nenhum GSE configurado, o sistema verifica essas palavras-chave. Usado APENAS na triagem — não serve para o filtro de Consulta de Chamados." style="cursor:help;margin-left:4px;font-size:11px;color:var(--sp-text-dim);font-weight:400;">ℹ️</span>
            </div>
            ${isGeneralTeam ? '<div style="font-size:12px;color:var(--sp-text-muted);margin-bottom:8px;">⚠️ A equipe GERAL não utiliza palavras-chave (é o fallback para tudo que não bateu em nenhuma regra).</div>' : `
            <div style="font-size:11px;color:var(--sp-text-muted);margin-bottom:10px;">A equipe será sugerida quando o chamado contiver a palavra-chave no campo correspondente (insensível a maiúsculas/minúsculas).</div>
            <div style="margin-bottom:10px;border:1px solid var(--sp-border);border-radius:8px;padding:10px;background:var(--sp-surface-2);">
              <div style="font-size:11px;font-weight:600;color:var(--sp-accent);margin-bottom:6px;">📍 Local de Registro
                <span style="font-weight:400;color:var(--sp-text-dim);margin-left:4px;">(campo RegisteredForLocation do chamado)</span>
              </div>
              <div style="display:flex;gap:6px;margin-bottom:6px;">
                <input type="text" id="smax-team-location-input" placeholder="Ex: CAMPINAS, SANTOS, CAPITAL..."
                       style="flex:1;padding:6px 10px;border:1px solid var(--sp-border);border-radius:6px;font-size:12px;background:var(--sp-input-bg);color:var(--sp-text);box-sizing:border-box;">
                <button id="smax-add-location-matcher-btn" style="padding:6px 12px;background:var(--sp-primary-bg);color:var(--sp-accent);border:1px solid var(--sp-accent);border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">+ Adicionar</button>
              </div>
              <div id="smax-matchers-list-location">${locationMatchersHtml}</div>
            </div>
            <div style="border:1px solid var(--sp-border);border-radius:8px;padding:10px;background:var(--sp-surface-2);">
              <div style="font-size:11px;font-weight:600;color:var(--sp-text-muted);margin-bottom:6px;">📝 Assunto / Descrição
                <span style="font-weight:400;color:var(--sp-text-dim);margin-left:4px;">(título e corpo do chamado)</span>
              </div>
              <div style="display:flex;gap:6px;margin-bottom:6px;">
                <input type="text" id="smax-team-text-input" placeholder="Ex: IMPRESSORA, VPN, SENHA..."
                       style="flex:1;padding:6px 10px;border:1px solid var(--sp-border);border-radius:6px;font-size:12px;background:var(--sp-input-bg);color:var(--sp-text);box-sizing:border-box;">
                <button id="smax-add-text-matcher-btn" style="padding:6px 12px;background:var(--sp-primary-bg);color:var(--sp-accent);border:1px solid var(--sp-accent);border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">+ Adicionar</button>
              </div>
              <div id="smax-matchers-list-text">${textMatchersHtml}</div>
            </div>`}
          </div>

          <div style="margin-bottom:12px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:4px;color:var(--sp-text);">Membros e Distribuição
              <span title="Cada membro recebe um intervalo de dígitos finais do ID do chamado (ex: '0-9' significa que chamados terminados em 0 a 9 são desse membro). A triagem usa isso para sugerir automaticamente quem deve atender. Marque 'Ausente' para que o sistema pule para o próximo par de dígitos ao sugerir responsável." style="cursor:help;margin-left:4px;font-size:11px;color:var(--sp-text-dim);font-weight:400;">ℹ️</span>
            </div>
            <div style="margin-bottom:8px;border:1px solid var(--sp-border);background:var(--sp-surface-2);border-radius:8px;padding:8px;">
              <input type="text" id="smax-team-person-search" placeholder="🔍 Buscar pessoa para adicionar..."
                     style="width:100%;padding:6px 10px;border:1px solid var(--sp-border);border-radius:6px;font-size:12px;margin-bottom:4px;background:var(--sp-input-bg);color:var(--sp-text);box-sizing:border-box;">
              <div id="smax-team-person-results" style="max-height:100px;overflow-y:auto;border-top:1px solid var(--sp-border);display:none;background:var(--sp-surface);"></div>
            </div>
            <div id="smax-workers-list">${workersHtml}</div>
          </div>

          <div style="margin-bottom:12px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:4px;color:var(--sp-text);">Assinatura da equipe
              <span title="HTML da assinatura que aparece no seletor ✒️ do editor de solução para esta equipe." style="cursor:help;margin-left:4px;font-size:11px;color:var(--sp-text-dim);font-weight:400;">ℹ️</span>
            </div>
            <textarea id="smax-team-signature" placeholder="<p>Atenciosamente,<br>Equipe de Suporte</p>" rows="3"
              style="width:100%;padding:7px 10px;border:1px solid var(--sp-border);border-radius:8px;background:var(--sp-input-bg);color:var(--sp-text);font-size:11px;resize:vertical;box-sizing:border-box;font-family:monospace;outline:none;">${Utils.escapeHtml((SignatureManager.getTeamSignatures()[team.id]) || '')}</textarea>
          </div>

          <div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:14px;flex-wrap:wrap;">
            <button class="smax-cancel-edit" style="padding:8px 14px;cursor:pointer;background:var(--sp-surface-2);color:var(--sp-text);border:1px solid var(--sp-border);border-radius:8px;font-size:12px;">Cancelar</button>
            <button id="smax-save-team-btn" style="padding:8px 16px;cursor:pointer;background:var(--sp-accent);color:var(--sp-on-accent);border:none;border-radius:8px;font-size:12px;font-weight:600;">Salvar Equipe</button>
          </div>
        </div>
      `;
    };

    const wireTeamEvents = () => {
      // List View Events
      const addBtn = container.querySelector('#smax-add-team-btn');
      if (addBtn) addBtn.addEventListener('click', () => { editingTeamId = '__NEW__'; renderPanel(); });

      container.querySelectorAll('.smax-team-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => { editingTeamId = btn.dataset.id; renderPanel(); });
      });

      container.querySelectorAll('.smax-team-del-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          if (confirm(`Tem certeza que deseja remover a equipe "${id}"?`)) {
            currentTeams = currentTeams.filter(t => t.id !== id);
            saveConfig();
            renderPanel();
          }
        });
      });

      // Edit View Events
      if (editingTeamId) {
        // Toggle Logic for existing rows
        container.querySelectorAll('.smax-worker-absent-wrapper').forEach(wrapper => {
          const chk = wrapper.querySelector('.smax-worker-absent');
          const fake = wrapper.querySelector('.smax-absent-fake');
          wrapper.addEventListener('click', () => {
            chk.checked = !chk.checked;
            fake.style.background = chk.checked ? 'var(--sp-danger)' : 'var(--sp-surface)';
            fake.style.borderColor = chk.checked ? 'var(--sp-danger)' : 'var(--sp-border)';
          });
        });

        const cancelBtn = container.querySelector('.smax-cancel-edit');
        if (cancelBtn) cancelBtn.addEventListener('click', () => { editingTeamId = null; renderPanel(); });

        const saveBtn = container.querySelector('#smax-save-team-btn');
        if (saveBtn) saveBtn.addEventListener('click', () => {
          const idInput = container.querySelector('#smax-edit-id');
          const prioInput = container.querySelector('#smax-edit-prio');
          const newId = idInput.value.trim();
          const newPrio = parseInt(prioInput.value, 10) || 0;

          if (!newId) return alert('O ID da equipe é obrigatório.');
          if (editingTeamId === '__NEW__' && currentTeams.some(t => t.id === newId)) return alert('Já existe uma equipe com este ID.');

          // Collect GSEs
          const newGseRules = [];
          container.querySelectorAll('#smax-gse-list > div').forEach(div => {
            const idInput = div.querySelector('.smax-gse-id');
            const nameInput = div.querySelector('.smax-gse-name');
            if (idInput && nameInput) {
              newGseRules.push({ id: idInput.value, name: nameInput.value });
            }
          });

          // Collect workers
          const newWorkers = [];
          container.querySelectorAll('#smax-workers-list > div').forEach(div => {
            const nameInput = div.querySelector('.smax-worker-name');
            const digitsInput = div.querySelector('.smax-worker-digits');
            const absentInput = div.querySelector('.smax-worker-absent');
            if (nameInput && digitsInput) {
              const name = nameInput.value.trim();
              const digits = digitsInput.value.trim();
              const isAbsent = absentInput ? !!absentInput.checked : false;
              if (name) newWorkers.push({ name, digits, isAbsent });
            }
          });
          // Sort workers alphabetically by name for better UX
          newWorkers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));

          // Validate digit range overlaps between workers
          const digitOwnerMap = {};
          const overlapDetails = [];
          for (const w of newWorkers) {
            const parsed = Utils.parseDigitRanges(w.digits);
            for (const d of parsed) {
              if (digitOwnerMap[d] !== undefined) {
                overlapDetails.push(`dígito ${d}: "${digitOwnerMap[d]}" e "${w.name}"`);
              } else {
                digitOwnerMap[d] = w.name;
              }
            }
          }
          if (overlapDetails.length) {
            const msg = `⚠️ Sobreposição de dígitos detectada:\n${overlapDetails.slice(0, 5).join('\n')}${overlapDetails.length > 5 ? `\n...e mais ${overlapDetails.length - 5}` : ''}\n\nSalvar assim pode causar distribuição imprevisível. Continuar?`;
            if (!confirm(msg)) return;
          }

          // Collect matchers from both scope sections
          const newMatchers = [];
          const collectMatchers = (listId, scope) => {
            container.querySelectorAll(`#${listId} > div`).forEach(div => {
              const patternInput = div.querySelector('.smax-matcher-pattern');
              if (patternInput) {
                const pattern = patternInput.value.trim();
                if (pattern) newMatchers.push({ type: 'regex', pattern, scope, _displayText: pattern.replace(/\\/g, '') });
              }
            });
          };
          collectMatchers('smax-matchers-list-location', 'location');
          collectMatchers('smax-matchers-list-text', 'text');

          // Update state
          if (editingTeamId === '__NEW__') {
            const newTeam = { id: newId, name: newId, priority: newPrio, gseRules: newGseRules, workers: newWorkers, matchers: newMatchers };
            currentTeams.push(newTeam);
          } else {
            const idx = currentTeams.findIndex(t => t.id === editingTeamId);
            if (idx !== -1) {
              const existingTeam = currentTeams[idx];
              const isDefault = !!existingTeam.isDefault;
              const updatedName = isDefault ? existingTeam.name : newId;
              const updatedId = isDefault ? existingTeam.id : newId;
              currentTeams[idx] = { ...existingTeam, id: updatedId, name: updatedName, priority: newPrio, gseRules: newGseRules, workers: newWorkers, matchers: newMatchers };
            }
          }

          // Save team signature — use the actual persisted team ID
          const sigTextarea = container.querySelector('#smax-team-signature');
          if (sigTextarea) {
            const savedTeam = currentTeams.find(t => t.id === newId) || currentTeams.find(t => t.id === editingTeamId);
            const finalTeamId = savedTeam ? savedTeam.id : newId;
            const sigs = SignatureManager.getTeamSignatures();
            const sigVal = sigTextarea.value.trim();
            if (sigVal) sigs[finalTeamId] = sigVal;
            else delete sigs[finalTeamId];
            SignatureManager.saveTeamSignatures(sigs);
          }

          editingTeamId = null;
          saveConfig();
          renderPanel();
        });

        // --- GSE Search Logic ---
        const gseSearchInput = container.querySelector('#smax-team-gse-search');
        const gseResultsEl = container.querySelector('#smax-team-gse-results');

        const addGseResult = (id, name) => {
          const list = container.querySelector('#smax-gse-list');
          const tempDiv = document.createElement('div');
          tempDiv.style.display = 'flex';
          tempDiv.style.gap = '6px';
          tempDiv.style.marginBottom = '6px';
          tempDiv.style.alignItems = 'center';
          tempDiv.innerHTML = `
            <input type="hidden" class="smax-gse-id" value="${Utils.escapeHtml(id)}">
            <input type="text" class="smax-gse-name" value="${Utils.escapeHtml(name)}" disabled style="flex:1;font-size:11px;padding:6px;border:1px solid var(--sp-border);border-radius:6px;background:var(--sp-surface-2);color:var(--sp-text-muted);opacity:.8;">
            <button class="smax-gse-del-btn" style="color:var(--sp-danger-text);border:1px solid var(--sp-danger-border);background:var(--sp-danger-bg);padding:4px 8px;border-radius:4px;cursor:pointer;">✕</button>
          `;
          tempDiv.querySelector('.smax-gse-del-btn').addEventListener('click', (e) => e.target.closest('div').remove());
          if (list) list.appendChild(tempDiv);
          gseSearchInput.value = '';
          gseResultsEl.style.display = 'none';
        };

        if (gseSearchInput && gseResultsEl) {
          gseSearchInput.addEventListener('input', () => {
            const q = gseSearchInput.value.toUpperCase();
            gseResultsEl.style.display = q ? 'block' : 'none';
            if (!q) return;

            // Search supportGroupMap from DataRepository
            // Note: supportGroupMap keys are IDs. Values are objects? 
            // We need to access the map. DataRepository doesn't expose it directly but has 'getSupportGroupsSnapshot'
            // Actually currently 'DataRepository.getSupportGroupsSnapshot' returns array.
            // Let's check getSupportGroupsSnapshot signature.
            // It returns Array.from(supportGroupMap.values())

            const groups = DataRepository.getSupportGroupsSnapshot();
            if (!groups.length) {
              gseResultsEl.innerHTML = '<div style="padding:4px;color:var(--sp-text-muted);font-size:10px;">Carregando GSEs... (clique no HUD para forçar)</div>';
              DataRepository.ensureSupportGroups(); // Trigger load if needed
              return;
            }

            const matches = groups.filter(g => (g.name || '').toUpperCase().includes(q) || (g.id || '').includes(q)).slice(0, 15);

            if (!matches.length) {
              gseResultsEl.innerHTML = '<div style="padding:4px;color:var(--sp-text-muted);font-size:10px;">Nenhum resultado.</div>';
            } else {
              gseResultsEl.innerHTML = matches.map(g => `
                  <div class="smax-gse-pick" data-id="${g.id}" data-name="${Utils.escapeHtml(g.name)}" style="padding:5px 8px;cursor:pointer;font-size:11px;border-bottom:1px solid var(--sp-border);color:var(--sp-text);">
                    <div><strong>${Utils.escapeHtml(g.name)}</strong></div>
                    <div style="color:var(--sp-text-muted);font-size:10px;">ID: ${g.id}</div>
                  </div>
               `).join('');

              gseResultsEl.querySelectorAll('.smax-gse-pick').forEach(el => {
                el.addEventListener('click', () => {
                  addGseResult(el.dataset.id, el.dataset.name);
                });
              });
            }
          });
          gseSearchInput.addEventListener('blur', () => setTimeout(() => { gseResultsEl.style.display = 'none'; }, 200));
          gseSearchInput.addEventListener('focus', () => DataRepository.ensureSupportGroups());
        }

        // Existing deletes for initial render
        container.querySelectorAll('.smax-gse-del-btn').forEach(b => b.addEventListener('click', e => e.target.closest('div').remove()));

        // --- Matcher Logic (location + text scopes) ---
        const wireMatcherInput = (inputId, btnId, listId, scope) => {
          const input = container.querySelector(`#${inputId}`);
          const btn   = container.querySelector(`#${btnId}`);
          const list  = container.querySelector(`#${listId}`);
          if (!input || !btn || !list) return;

          const addRow = () => {
            const text = input.value.trim();
            if (!text) return;
            const escapedPattern = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;align-items:center;background:var(--sp-surface-2);border:1px solid var(--sp-border);padding:6px 8px;border-radius:8px;';
            row.innerHTML = `
              <input type="hidden" class="smax-matcher-pattern" value="${Utils.escapeHtml(escapedPattern)}">
              <input type="hidden" class="smax-matcher-scope" value="${Utils.escapeHtml(scope)}">
              <span style="flex:1;font-size:11px;color:var(--sp-text-muted);">contém: <strong style="color:var(--sp-text);">${Utils.escapeHtml(text)}</strong></span>
              <button class="smax-matcher-del-btn" style="color:var(--sp-danger-text);border:1px solid var(--sp-danger-border);background:var(--sp-danger-bg);padding:4px 8px;border-radius:4px;cursor:pointer;">✕</button>`;
            row.querySelector('.smax-matcher-del-btn').addEventListener('click', () => row.remove());
            list.appendChild(row);
            input.value = '';
          };

          btn.addEventListener('click', addRow);
          input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addRow(); } });
        };

        wireMatcherInput('smax-team-location-input', 'smax-add-location-matcher-btn', 'smax-matchers-list-location', 'location');
        wireMatcherInput('smax-team-text-input',     'smax-add-text-matcher-btn',     'smax-matchers-list-text',     'text');

        // Delete buttons for rows rendered on load
        container.querySelectorAll('.smax-matcher-del-btn').forEach(b => b.addEventListener('click', () => b.closest('div').remove()));

        // --- Person Search Logic (Existing) ---
        const searchInput = container.querySelector('#smax-team-person-search');
        const resultsEl = container.querySelector('#smax-team-person-results');

        const addWorkerResult = (name) => {
          const list = container.querySelector('#smax-workers-list');
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = `
            <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;background:var(--sp-surface-2);border:1px solid var(--sp-border);padding:8px;border-radius:8px;">
              <input type="text" class="smax-worker-name" value="${Utils.escapeHtml(name)}" style="flex:1;font-size:11px;padding:6px;border:1px solid var(--sp-border);border-radius:6px;background:var(--sp-input-bg);color:var(--sp-text);" placeholder="Nome do Responsável">
              <input type="text" class="smax-worker-digits" value="" style="width:80px;font-size:11px;padding:6px;border:1px solid var(--sp-border);border-radius:6px;background:var(--sp-input-bg);color:var(--sp-text);" placeholder="Digitos (ex: 0-9)">
              <div class="smax-worker-absent-wrapper" style="display:flex;align-items:center;cursor:pointer;user-select:none;">
                <input type="checkbox" class="smax-worker-absent" style="display:none;">
                <div class="smax-absent-fake" style="width:14px;height:14px;border:1px solid var(--sp-border);margin-right:4px;background:transparent;border-radius:2px;display:flex;align-items:center;justify-content:center;"></div>
                <span style="font-size:10px;color:var(--sp-danger-text);">Ausente</span>
              </div>
              <button class="smax-remove-temp-row" style="color:var(--sp-danger-text);border:1px solid var(--sp-danger-border);background:var(--sp-danger-bg);padding:4px 8px;border-radius:4px;cursor:pointer;">✕</button>
            </div>`;
          const row = tempDiv.firstElementChild;
          row.querySelector('.smax-remove-temp-row').addEventListener('click', () => row.remove());

          // Custom toggle logic
          const wrapper = row.querySelector('.smax-worker-absent-wrapper');
          const chk = row.querySelector('.smax-worker-absent');
          const fake = row.querySelector('.smax-absent-fake');

          wrapper.addEventListener('click', () => {
            chk.checked = !chk.checked;
            fake.style.background = chk.checked ? 'var(--sp-danger)' : 'transparent';
            fake.style.borderColor = chk.checked ? 'var(--sp-danger)' : 'var(--sp-border)';
          });
          if (list) list.appendChild(tempDiv.firstElementChild);
          // Clear search
          searchInput.value = '';
          resultsEl.style.display = 'none';
        };

        if (searchInput && resultsEl) {
          const attachPickHandlers = () => {
            resultsEl.querySelectorAll('.smax-person-pick').forEach(el => {
              el.addEventListener('click', () => {
                const name = el.getAttribute('data-name');
                if (name) addWorkerResult(name);
              });
            });
          };

          let _remoteTimer = null;
          const renderSearchResults = (term) => {
            const q = (term || '').trim().toUpperCase();
            clearTimeout(_remoteTimer);
            resultsEl.style.display = q ? 'block' : 'none';
            if (!q) return;

            if (!DataRepository.peopleCache.size) {
              resultsEl.innerHTML = '<div style="padding:4px;color:var(--sp-text-muted);font-size:10px;">Carregando...</div>';
              return;
            }

            const matches = [];
            for (const p of DataRepository.peopleCache.values()) {
              const name = (p.name || '').toUpperCase();
              const upn = (p.upn || '').toUpperCase();
              if (name.includes(q) || upn.includes(q)) {
                matches.push(p);
                if (matches.length >= 20) break;
              }
            }

            const personRow = (p) => `<div class="smax-person-pick" data-name="${Utils.escapeHtml(p.name)}" style="padding:5px 8px;cursor:pointer;font-size:11px;border-bottom:1px solid var(--sp-border);color:var(--sp-text);"><strong>${Utils.escapeHtml(p.name)}</strong> ${p.upn ? `<span style="color:var(--sp-text-muted);font-size:10px;">(${p.upn})</span>` : ''}</div>`;

            if (matches.length) {
              resultsEl.innerHTML = matches.map(personRow).join('');
              attachPickHandlers();
            } else if (q.length >= 3) {
              resultsEl.innerHTML = '<div style="padding:4px;color:var(--sp-text-muted);font-size:10px;">🔍 Buscando no SMAX...</div>';
              _remoteTimer = setTimeout(() => {
                DataRepository.searchPeopleRemote(q).then(remote => {
                  if ((searchInput.value || '').trim().toUpperCase() !== q) return;
                  if (!remote.length) {
                    resultsEl.innerHTML = '<div style="padding:4px;color:var(--sp-text-muted);font-size:10px;">Nenhum resultado no cache nem no SMAX.</div>';
                  } else {
                    resultsEl.innerHTML = '<div style="padding:4px;font-size:9px;color:var(--sp-text-dim);border-bottom:1px solid var(--sp-border);">Resultados do SMAX (busca global)</div>' + remote.map(personRow).join('');
                    resultsEl.style.display = 'block';
                    attachPickHandlers();
                  }
                });
              }, 500);
            } else {
              resultsEl.innerHTML = '<div style="padding:4px;color:var(--sp-text-muted);font-size:10px;">Nenhum resultado. Digite 3+ letras para buscar no SMAX.</div>';
            }
          };

          searchInput.addEventListener('input', () => renderSearchResults(searchInput.value));
          searchInput.addEventListener('focus', () => renderSearchResults(searchInput.value));
          // Hide on blur delayed to allow click
          searchInput.addEventListener('blur', () => setTimeout(() => { resultsEl.style.display = 'none'; }, 200));
        }

        // Existing deletes
        container.querySelectorAll('.smax-worker-del-btn').forEach(b => b.addEventListener('click', e => e.target.closest('div').remove()));
      }
    };

    // Shareable config keys (no personal identity — meant for team distribution)
    const CONFIG_KEYS = [
      'nameGroups', 'ausentes', 'enableRealWrites',
      'defaultGlobalChangeId', 'personalFinalsRaw', 'teamsConfigRaw',
      'teamSignaturesRaw', 'ackMessageTemplate'
    ];

    const buildConfigJSON = () => {
      const obj = {};
      CONFIG_KEYS.forEach(key => {
        if (prefs[key] === undefined) return;
        if (key === 'teamsConfigRaw') {
          try { obj.teams = JSON.parse(prefs[key]); } catch { obj.teams = prefs[key]; }
        } else if (key === 'teamSignaturesRaw') {
          try { obj.teamSignatures = JSON.parse(prefs[key]); } catch { obj.teamSignatures = prefs[key]; }
        } else if (key === 'ausentes') {
          // Deriva ausentes dos flags isAbsent dos workers (fonte única de verdade)
          const aus = [];
          try {
            const teams = JSON.parse(prefs.teamsConfigRaw || '[]');
            if (Array.isArray(teams)) teams.forEach(t => {
              if (Array.isArray(t.workers)) t.workers.forEach(w => {
                if (w.isAbsent && w.name && !aus.includes(w.name)) aus.push(w.name);
              });
            });
          } catch {}
          obj.ausentes = aus;
        } else {
          obj[key] = prefs[key];
        }
      });
      obj._version = '1.0';
      return JSON.stringify(obj, null, 2);
    };

    const applyConfigJSON = (raw) => {
      let parsed;
      try { parsed = JSON.parse(raw); }
      catch (err) { return { ok: false, msg: `JSON inválido: ${err.message}` }; }
      if (typeof parsed !== 'object' || parsed === null) return { ok: false, msg: 'O JSON deve ser um objeto.' };
      let count = 0;
      const details = [];
      CONFIG_KEYS.forEach(key => {
        if (key === 'teamsConfigRaw' && parsed.teams !== undefined) {
          prefs.teamsConfigRaw = typeof parsed.teams === 'string' ? parsed.teams : JSON.stringify(parsed.teams);
          const teams = Array.isArray(parsed.teams) ? parsed.teams : [];
          details.push(`Equipes: ${teams.length} (${teams.map(t => t.name || t.id).join(', ')})`);
          count++;
        } else if (key === 'teamSignaturesRaw' && parsed.teamSignatures !== undefined) {
          prefs.teamSignaturesRaw = typeof parsed.teamSignatures === 'string' ? parsed.teamSignatures : JSON.stringify(parsed.teamSignatures);
          const sigCount = typeof parsed.teamSignatures === 'object' ? Object.keys(parsed.teamSignatures).length : 0;
          details.push(`Assinaturas de equipe: ${sigCount} equipe(s)`);
          count++;
        } else if (parsed[key] !== undefined) {
          prefs[key] = parsed[key];
          count++;
          if (key === 'nameGroups') {
            const n = typeof parsed[key] === 'object' ? Object.keys(parsed[key]).length : 0;
            details.push(`Grupos de nomes: ${n} grupo(s)`);
          } else if (key === 'ausentes') {
            const arr = Array.isArray(parsed[key]) ? parsed[key] : [];
            details.push(`Ausentes: ${arr.length} (${arr.join(', ') || 'nenhum'})`);
          } else if (key === 'ackMessageTemplate') {
            details.push(`Msg. recebimento: "${(parsed[key] || '').substring(0, 40)}${(parsed[key] || '').length > 40 ? '…' : ''}"`);
          } else if (key === 'defaultGlobalChangeId') {
            details.push(`ID Global: ${parsed[key] || '(vazio)'}`);
          } else if (key === 'enableRealWrites') {
            details.push(`Gravação real: ${parsed[key] ? 'SIM' : 'NÃO'}`);
          }
        }
      });
      if (!count) return { ok: false, msg: 'Nenhuma chave de configuração reconhecida.' };
      savePrefs();
      TeamsConfig.reload();
      reloadConfig();
      return { ok: true, msg: `${count} configurações aplicadas. ✓\n${details.join('\n')}` };
    };

    const publishConfigToGit = (onStatus) => {
      const token  = (prefs.githubToken || '').trim();
      const rawUrl = (prefs.sharedConfigUrl || '').trim();
      if (!token)  return onStatus('Configure o Token do GitHub primeiro.', false);
      if (!rawUrl) return onStatus('URL do shared-config não configurada.', false);

      const m = rawUrl.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
      if (!m) return onStatus('URL deve ser raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}.', false);
      const [, owner, repo, branch, filePath] = m;
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
      const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' };

      onStatus('Buscando arquivo atual no GitHub...', null);

      // Busca SHA atual do arquivo
      GM_xmlhttpRequest({
        method: 'GET', url: `${apiUrl}?ref=${branch}`, headers,
        onload: (res) => {
          let sha = '';
          try {
            if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
            sha = JSON.parse(res.responseText).sha;
          } catch (e) {
            return onStatus(`Erro ao buscar arquivo: ${e.message}`, false);
          }

          // Monta novo conteúdo — inclui todas as configurações compartilhadas
          const existing = SharedConfig.get() || {};
          let teams = [];
          try { teams = JSON.parse(prefs.teamsConfigRaw); } catch {}
          let teamSigs = {};
          try { teamSigs = JSON.parse(prefs.teamSignaturesRaw || '{}'); } catch {}
          // Deriva ausentes dos flags isAbsent dos workers (fonte única de verdade)
          const ausentes = [];
          if (Array.isArray(teams)) {
            teams.forEach(t => {
              if (Array.isArray(t.workers)) {
                t.workers.forEach(w => {
                  if (w.isAbsent && w.name && !ausentes.includes(w.name)) ausentes.push(w.name);
                });
              }
            });
          }
          const newData = {
            ...existing,
            _version: ((existing._version || 0) * 1 + 1),
            _updatedAt: new Date().toISOString().split('T')[0],
            _description: existing._description || 'Configuração compartilhada SMAX Toolkit TJSP.',
            nameGroups: prefs.nameGroups || {},
            ausentes,
            enableRealWrites: prefs.enableRealWrites,
            defaultGlobalChangeId: prefs.defaultGlobalChangeId || '',
            teams,
            teamSignatures: teamSigs,
            ackMessageTemplate: prefs.ackMessageTemplate || '',
            scripts: existing.scripts || { sol: [], disc: [] },
          };
          const content = btoa(unescape(encodeURIComponent(JSON.stringify(newData, null, 2))));

          onStatus('Publicando no GitHub...', null);
          GM_xmlhttpRequest({
            method: 'PUT', url: apiUrl, headers,
            data: JSON.stringify({ message: `chore: atualiza shared-config SMAX Toolkit v${newData._version}`, content, sha, branch }),
            onload: (r) => {
              if (r.status === 200 || r.status === 201) {
                onStatus(`✓ Publicado! v${newData._version} — todos receberão na próxima sincronização.`, true);
                SharedConfig.refresh(true);
              } else {
                let detail = '';
                try { detail = JSON.parse(r.responseText).message || ''; } catch {}
                onStatus(`Erro HTTP ${r.status}${detail ? ': ' + detail : ''}.`, false);
              }
            },
            onerror: () => onStatus('Erro de rede ao publicar.', false),
          });
        },
        onerror: () => onStatus('Erro de rede ao buscar arquivo.', false),
      });
    };

    /* ── Section content renderers ── */

    const renderSectionGeral = () => {
      const triadorName = prefs.myPersonName || '';
      return `
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div class="smax-sp-card">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
              <span style="font-size:20px;">👤</span>
              <div>
                <div style="font-weight:600;color:var(--sp-primary);font-size:15px;">Quem é você?</div>
                <div class="smax-sp-muted">Seu nome será vinculado aos chamados globais</div>
              </div>
            </div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              <div style="flex:1;position:relative;min-width:180px;">
                <input type="text" id="smax-triador-search" placeholder="Buscar por nome..."
                  style="width:100%;padding:9px 12px;border-radius:8px;font-size:13px;box-sizing:border-box;transition:border-color .15s,box-shadow .15s;">
                <div id="smax-triador-results" style="display:none;position:absolute;top:100%;left:0;right:0;max-height:220px;overflow-y:auto;background:var(--sp-surface-2);border:1px solid var(--sp-input-border);border-top:none;border-radius:0 0 8px 8px;z-index:200;box-shadow:0 12px 24px rgba(0,0,0,.5);"></div>
              </div>
              ${triadorName ? `
                <div id="smax-triador-current" style="display:flex;align-items:center;padding:8px 14px;background:var(--sp-send);border-radius:8px;font-size:12px;color:#fff;font-weight:500;white-space:nowrap;box-shadow:0 4px 12px var(--sp-ring);flex-shrink:0;">
                  ✓ ${Utils.escapeHtml(triadorName)}
                </div>
              ` : `
                <div id="smax-triador-current" style="display:flex;align-items:center;padding:8px 14px;background:var(--sp-danger-bg);border:1px solid var(--sp-danger-border);border-radius:8px;font-size:12px;color:var(--sp-danger-text);white-space:nowrap;flex-shrink:0;">
                  ⚠️ Não configurado
                </div>
              `}
            </div>
          </div>
        </div>
        <div class="smax-sp-card">
          <div class="smax-sp-section-title">☁️ Config. Compartilhada</div>
          <div class="smax-sp-muted" style="margin-bottom:10px;">
            Equipes e scripts carregados de um arquivo JSON público (GitHub). Todos os usuários que apontarem para a mesma URL recebem as mesmas configurações automaticamente.
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
            <input type="text" id="smax-shared-url-input" value="${Utils.escapeHtml(prefs.sharedConfigUrl || '')}"
              placeholder="https://raw.githubusercontent.com/..."
              style="flex:1;min-width:200px;padding:7px 10px;border-radius:7px;font-size:11px;box-sizing:border-box;">
            <button type="button" id="smax-shared-save-btn" style="padding:7px 14px;border:none;border-radius:7px;background:var(--sp-primary);color:var(--sp-on-accent);font-size:12px;font-weight:600;cursor:pointer;">Salvar</button>
            <button type="button" id="smax-shared-refresh-btn" style="padding:7px 14px;border:1px solid var(--sp-border);border-radius:7px;background:var(--sp-surface-2);color:var(--sp-text);font-size:11px;cursor:pointer;">↺ Atualizar</button>
          </div>
          <div id="smax-shared-status" style="font-size:11px;color:var(--sp-text-muted);min-height:16px;"></div>
        </div>
        <div class="smax-sp-card">
          <div class="smax-sp-section-title">📨 Mensagem de Recebimento</div>
          <div class="smax-sp-muted" style="margin-bottom:10px;">Texto enviado como discussão pública ao clicar em "Recebimento". Cada linha vira um parágrafo.</div>
          <textarea id="smax-ack-template-textarea" spellcheck="false"
            style="width:100%;min-height:100px;max-height:200px;resize:vertical;padding:10px 12px;border-radius:8px;font-size:13px;font-family:'Segoe UI',system-ui,sans-serif;line-height:1.5;box-sizing:border-box;">${Utils.escapeHtml(prefs.ackMessageTemplate || '')}</textarea>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button type="button" id="smax-ack-template-save-btn" style="padding:7px 14px;border:none;border-radius:7px;background:var(--sp-primary);color:var(--sp-on-accent);font-size:12px;font-weight:600;cursor:pointer;">Salvar</button>
            <button type="button" id="smax-ack-template-reset-btn" style="padding:7px 14px;border:1px solid var(--sp-border);border-radius:7px;background:var(--sp-surface-2);color:var(--sp-text);font-size:11px;cursor:pointer;">↺ Restaurar padrão</button>
          </div>
          <div id="smax-ack-template-status" style="font-size:11px;color:var(--sp-text-muted);min-height:16px;margin-top:6px;"></div>
        </div>
        <div class="smax-sp-card">
          <div class="smax-sp-section-title">🔧 Exportar / Importar Configuração</div>
          <div class="smax-sp-muted" style="margin-bottom:10px;">JSON com todas as configurações, incluindo equipes. Copie para compartilhar ou cole para restaurar.</div>
          <textarea id="smax-config-io-textarea" spellcheck="false"
            style="width:100%;min-height:180px;max-height:320px;resize:vertical;padding:10px 12px;border-radius:8px;font-size:11px;font-family:'Cascadia Code','Fira Code','Consolas',monospace;line-height:1.5;box-sizing:border-box;transition:border-color .15s ease;"></textarea>
          <div id="smax-config-io-status" style="font-size:11px;color:var(--sp-text-muted);min-height:16px;margin:8px 0;white-space:pre-line;"></div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            <button type="button" id="smax-config-copy-btn" style="padding:8px 14px;border-radius:8px;border:1px solid var(--sp-border);background:var(--sp-surface);color:var(--sp-text);font-size:12px;cursor:pointer;">📋 Copiar</button>
            <button type="button" id="smax-config-save-btn" style="padding:8px 14px;border-radius:8px;border:none;background:var(--sp-primary);color:var(--sp-on-accent);font-size:12px;cursor:pointer;font-weight:600;">💾 Salvar localmente</button>
          </div>
          <div style="border-top:1px solid var(--sp-border);margin-top:14px;padding-top:14px;">
            <div class="smax-sp-section-title" style="font-size:12px;margin-bottom:4px;">🚀 Publicar para a equipe (Git)</div>
            <div class="smax-sp-muted" style="margin-bottom:8px;">Salva a config diretamente no GitHub. Todos os usuários recebem automaticamente na próxima sincronização.</div>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
              <input type="password" id="smax-github-token-input" placeholder="ghp_••••••••••••••••••••••••"
                value="${Utils.escapeHtml(prefs.githubToken || '')}"
                style="flex:1;min-width:180px;padding:7px 10px;border-radius:7px;font-size:11px;box-sizing:border-box;border:1px solid var(--sp-border);background:var(--sp-surface);color:var(--sp-text);">
              <button type="button" id="smax-github-token-save-btn" style="padding:7px 14px;border:none;border-radius:7px;background:var(--sp-surface-2);color:var(--sp-text);font-size:11px;border:1px solid var(--sp-border);cursor:pointer;white-space:nowrap;">Salvar token</button>
            </div>
            <button type="button" id="smax-config-publish-btn" style="width:100%;padding:10px;border-radius:8px;border:none;background:var(--sp-primary);color:var(--sp-on-accent);font-size:12px;font-weight:600;cursor:pointer;">🚀 Publicar para a equipe</button>
            <div id="smax-config-publish-status" style="font-size:11px;color:var(--sp-text-muted);min-height:16px;margin-top:8px;"></div>
          </div>
        </div>`;
    };

    const renderSectionEquipes = () => `<div style="display:flex;flex-direction:column;gap:14px;">${renderTeamsList()}</div>`;

    const renderSectionEspecialistas = () => {
      const allWorkers = [];
      TeamsConfig.getTeams().forEach(t => (t.workers || []).forEach(w => allWorkers.push({ ...w, teamName: t.name || t.id })));
      if (!allWorkers.length) return `<div class="smax-sp-card"><div class="smax-sp-muted" style="text-align:center;padding:20px;">Nenhum especialista cadastrado nas equipes.</div></div>`;
      return `
        <div class="smax-sp-card">
          <div class="smax-sp-section-title">Especialistas cadastrados</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${allWorkers.map(w => `
                <div style="display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid var(--sp-border);border-radius:8px;background:var(--sp-surface-2);">
                  <div style="flex:1;min-width:100px;">
                    <div style="font-size:13px;font-weight:500;color:var(--sp-text);">${Utils.escapeHtml(w.name || '')}</div>
                    <div class="smax-sp-muted">${Utils.escapeHtml(w.teamName)}</div>
                  </div>
                </div>`).join('')}
          </div>
        </div>`;
    };

    const renderSectionTriagem = () => `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div class="smax-sp-card">
          <div class="smax-sp-section-title">🎯 HUD de Triagem</div>
          <div class="smax-sp-muted" style="margin-bottom:14px;">
            Abre o painel de triagem sobre a lista de chamados. Navegue pelos chamados, defina urgência, atribua responsável e envie respostas rapidamente.<br>
            <strong style="color:var(--sp-text);font-size:11px;">Dica:</strong> filtre e ordene os chamados no SMAX antes de iniciar.
          </div>
          <button id="smax-launch-triage-btn" style="padding:11px 28px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-weight:700;background:var(--sp-primary);color:var(--sp-on-accent);transition:opacity .15s;">
            🚀 Iniciar Triagem
          </button>
        </div>
        <div class="smax-sp-card">
          <div class="smax-sp-section-title">📖 Guia Rápido</div>
          <ul style="margin:4px 0 0;padding-left:18px;font-size:12px;color:var(--sp-text);line-height:1.7;">
            <li>Use os botões de urgência para definir impacto antes de atribuir.</li>
            <li>"Meus finais" limita a fila aos IDs desejados (ex: 0-32, 50).</li>
            <li>Edite a resposta rápida e clique ENVIAR para gravar tudo de uma vez.</li>
            <li>Os chamados são ordenados por VIP e mais antigos primeiro.</li>
            <li style="color:var(--sp-danger-text);font-weight:600;">CUIDADO: Vincular Global NÃO verifica se o número é válido.</li>
          </ul>
        </div>
        <div class="smax-sp-card">
          <div class="smax-sp-section-title">📊 Log de Atividades</div>
          <div class="smax-sp-muted" style="margin-bottom:10px;">${ActivityLog.getCount()} registros armazenados localmente.</div>
          ${ActivityLog.getSyncFailCount() > 0 ? `<div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:10px;padding:7px 12px;border-radius:8px;background:var(--sp-danger-bg);border:1px solid var(--sp-danger-border);color:var(--sp-danger);font-size:12px;">⚠️ ${ActivityLog.getSyncFailCount()} falha(s) de sincronização com Supabase nesta sessão. <button type="button" id="smax-log-reset-syncfail" style="border:none;background:none;color:var(--sp-danger);cursor:pointer;font-size:11px;text-decoration:underline;padding:0;">Limpar</button></div>` : ''}
          <button type="button" id="smax-log-export-all" style="padding:9px 18px;border-radius:8px;border:1px solid var(--sp-border);background:var(--sp-surface-2);color:var(--sp-text);font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
            📥 Exportar CSV
          </button>
        </div>
      </div>`;

    const renderSectionAssinaturas = () => {
      const sigs = SignatureManager.getPersonalSignatures();
      const sigsHtml = sigs.map((s, i) => `
        <div class="smax-sig-row" data-idx="${i}" style="display:flex;flex-direction:column;gap:6px;padding:10px;border:1px solid var(--sp-border);border-radius:8px;background:var(--sp-surface-2);">
          <div style="display:flex;gap:6px;align-items:center;">
            <input type="text" class="smax-sig-name" value="${Utils.escapeHtml(s.name || '')}" placeholder="Nome (ex: Suporte N1)"
              style="flex:1;padding:5px 8px;border:1px solid var(--sp-border);border-radius:6px;background:var(--sp-input-bg);color:var(--sp-text);font-size:12px;outline:none;">
            <button class="smax-sig-del-btn" style="background:none;border:1px solid var(--sp-danger-text);border-radius:6px;color:var(--sp-danger-text);cursor:pointer;padding:4px 10px;font-size:11px;">✕ Remover</button>
          </div>
          <textarea class="smax-sig-html" placeholder="<p>Atenciosamente,<br>Suporte TJSP</p>" rows="4"
            style="width:100%;padding:7px 10px;border:1px solid var(--sp-border);border-radius:6px;background:var(--sp-input-bg);color:var(--sp-text);font-size:11px;resize:vertical;box-sizing:border-box;font-family:monospace;outline:none;">${Utils.escapeHtml(s.html || '')}</textarea>
          <div class="smax-sig-preview" style="padding:8px 10px;border:1px dashed var(--sp-border);border-radius:6px;font-size:12px;color:var(--sp-text);min-height:20px;line-height:1.5;">${Utils.sanitizeRichText(s.html || '') || '<em style="color:var(--sp-text-muted);">Pré-visualização da assinatura</em>'}</div>
        </div>`).join('');

      return `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div class="smax-sp-card">
          <div class="smax-sp-section-title">✒️ Assinaturas Pessoais</div>
          <div class="smax-sp-muted" style="margin-bottom:10px;">
            Assinaturas pessoais que aparecem no seletor ✒️ do editor de solução. Use HTML para formatação.<br>
            Para assinaturas por equipe, edite cada equipe na aba <b>Equipes</b>.
          </div>
          <div id="smax-sig-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;">${sigsHtml}</div>
          <button id="smax-sig-add-btn" style="padding:6px 16px;border:1px dashed var(--sp-border);border-radius:8px;background:transparent;color:var(--sp-text-muted);cursor:pointer;font-size:12px;transition:all .15s;">+ Adicionar Assinatura</button>
        </div>
      </div>`;
    };

    const wireAssinaturasEvents = () => {
      const saveSigs = () => {
        const rows = container.querySelectorAll('.smax-sig-row');
        const sigs = Array.from(rows).map(row => ({
          name: row.querySelector('.smax-sig-name')?.value?.trim() || '',
          html: row.querySelector('.smax-sig-html')?.value?.trim() || ''
        })).filter(s => s.name || s.html);
        SignatureManager.savePersonalSignatures(sigs);
      };

      const updatePreview = (row) => {
        const htmlEl = row.querySelector('.smax-sig-html');
        const previewEl = row.querySelector('.smax-sig-preview');
        if (htmlEl && previewEl) {
          const html = htmlEl.value.trim();
          previewEl.innerHTML = Utils.sanitizeRichText(html) || '<em style="color:var(--sp-text-muted);">Pré-visualização da assinatura</em>';
        }
      };

      const wireRow = (row) => {
        row.querySelector('.smax-sig-name')?.addEventListener('input', saveSigs);
        const htmlEl = row.querySelector('.smax-sig-html');
        if (htmlEl) {
          htmlEl.addEventListener('input', () => { saveSigs(); updatePreview(row); });
        }
        row.querySelector('.smax-sig-del-btn')?.addEventListener('click', () => { row.remove(); saveSigs(); });
      };

      container.querySelectorAll('.smax-sig-row').forEach(wireRow);

      container.querySelector('#smax-sig-add-btn')?.addEventListener('click', () => {
        const listEl = container.querySelector('#smax-sig-list');
        if (!listEl) return;
        const div = document.createElement('div');
        div.className = 'smax-sig-row';
        Object.assign(div.style, { display:'flex', flexDirection:'column', gap:'6px', padding:'10px', border:'1px solid var(--sp-border)', borderRadius:'8px', background:'var(--sp-surface-2)' });
        div.innerHTML = `
          <div style="display:flex;gap:6px;align-items:center;">
            <input type="text" class="smax-sig-name" placeholder="Nome (ex: Suporte N1)"
              style="flex:1;padding:5px 8px;border:1px solid var(--sp-border);border-radius:6px;background:var(--sp-input-bg);color:var(--sp-text);font-size:12px;outline:none;">
            <button class="smax-sig-del-btn" style="background:none;border:1px solid var(--sp-danger-text);border-radius:6px;color:var(--sp-danger-text);cursor:pointer;padding:4px 10px;font-size:11px;">✕ Remover</button>
          </div>
          <textarea class="smax-sig-html" placeholder="<p>Atenciosamente,<br>Suporte TJSP</p>" rows="4"
            style="width:100%;padding:7px 10px;border:1px solid var(--sp-border);border-radius:6px;background:var(--sp-input-bg);color:var(--sp-text);font-size:11px;resize:vertical;box-sizing:border-box;font-family:monospace;outline:none;"></textarea>
          <div class="smax-sig-preview" style="padding:8px 10px;border:1px dashed var(--sp-border);border-radius:6px;font-size:12px;color:var(--sp-text);min-height:20px;line-height:1.5;"><em style="color:var(--sp-text-muted);">Pré-visualização da assinatura</em></div>`;
        listEl.appendChild(div);
        wireRow(div);
        div.querySelector('.smax-sig-name')?.focus();
      });
    };

    const renderSectionContent = () => {
      switch (activeSection) {
        case 'geral':         return renderSectionGeral();
        case 'equipes':       return renderSectionEquipes();
        case 'especialistas': return renderSectionEspecialistas();
        case 'triagem':       return renderSectionTriagem();
        case 'assinaturas':   return renderSectionAssinaturas();
        default:              return renderSectionGeral();
      }
    };

    /* ── Per-section event wiring ── */

    const wireGeralEvents = () => {
      if (!container) return;
      const triadorSearch  = container.querySelector('#smax-triador-search');
      const triadorResults = container.querySelector('#smax-triador-results');

      if (triadorSearch && triadorResults) {
        const selectTriador = (personId, personName) => {
          prefs.myPersonId   = personId;
          prefs.myPersonName = personName;
          savePrefs();
          triadorSearch.value = '';
          triadorResults.style.display = 'none';
          renderPanel();
        };
        const renderTriadorResults = (term) => {
          const q = (term || '').trim().toUpperCase();
          triadorResults.style.display = q ? 'block' : 'none';
          if (!q) return;
          if (!DataRepository.peopleCache.size) {
            triadorResults.innerHTML = '<div style="padding:8px;color:var(--sp-text-muted);font-size:11px;">Carregando...</div>';
            return;
          }
          const people = [...DataRepository.peopleCache.values()];
          const matches = people.filter(p =>
            (p.name || '').toUpperCase().includes(q) || (p.upn || '').toUpperCase().includes(q)
          ).slice(0, 10);
          if (!matches.length) {
            triadorResults.innerHTML = '<div style="padding:8px;color:var(--sp-text-muted);font-size:11px;">Nenhum resultado.</div>';
          } else {
            triadorResults.innerHTML = matches.map(p => `
              <div class="smax-triador-pick" data-id="${p.id}" data-name="${Utils.escapeHtml(p.name)}"
                style="padding:6px 8px;cursor:pointer;font-size:11px;border-bottom:1px solid var(--sp-border);transition:background .1s;">
                <div style="font-weight:500;color:var(--sp-text);">${Utils.escapeHtml(p.name)}</div>
                <div style="color:var(--sp-text-muted);font-size:10px;">${Utils.escapeHtml(p.upn || p.id)}</div>
              </div>
            `).join('');
            triadorResults.querySelectorAll('.smax-triador-pick').forEach(el => {
              el.addEventListener('click', () => selectTriador(el.dataset.id, el.dataset.name));
            });
          }
        };
        triadorSearch.addEventListener('input', () => renderTriadorResults(triadorSearch.value));
        triadorSearch.addEventListener('focus', () => {
          DataRepository.ensurePeopleLoaded();
          if (triadorSearch.value) renderTriadorResults(triadorSearch.value);
        });
        triadorSearch.addEventListener('blur', () => setTimeout(() => { triadorResults.style.display = 'none'; }, 200));
      }

      // Row click (outside the pill) toggles the switch
      container.querySelectorAll('.smax-module-row').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('.smax-toggle-sw')) return;
          const cb = row.querySelector('.smax-pref-toggle');
          if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        });
      });
      // Checkbox change: save state, update row style, trigger module
      container.querySelectorAll('.smax-pref-toggle').forEach(cb => {
        cb.addEventListener('change', () => {
          const key = cb.dataset.key;
          if (!(key in prefs)) return;
          prefs[key] = cb.checked;
          savePrefs();
          const row = cb.closest('.smax-module-row');
          if (row) row.classList.toggle('smax-active', cb.checked);
        });
      });

      // SharedConfig — salvar URL e atualizar
      const sharedStatusEl = container.querySelector('#smax-shared-status');
      const showSharedStatus = () => {
        if (!sharedStatusEl) return;
        const { text, loading } = SharedConfig.getStatus();
        sharedStatusEl.textContent = loading ? '⏳ ' + text : text;
      };
      showSharedStatus();

      container.querySelector('#smax-shared-save-btn')?.addEventListener('click', () => {
        const urlInput = container.querySelector('#smax-shared-url-input');
        const newUrl = (urlInput?.value || '').trim();
        prefs.sharedConfigUrl = newUrl;
        savePrefs();
        if (sharedStatusEl) sharedStatusEl.textContent = 'URL salva. Clique em Atualizar para buscar.';
      });

      container.querySelector('#smax-shared-refresh-btn')?.addEventListener('click', async () => {
        const urlInput = container.querySelector('#smax-shared-url-input');
        const newUrl = (urlInput?.value || '').trim();
        if (newUrl) { prefs.sharedConfigUrl = newUrl; savePrefs(); }
        if (sharedStatusEl) sharedStatusEl.textContent = '⏳ Buscando...';
        await SharedConfig.refresh(true);
        showSharedStatus();
      });

      // Ack template
      const ackTextarea = container.querySelector('#smax-ack-template-textarea');
      const ackStatusEl = container.querySelector('#smax-ack-template-status');
      container.querySelector('#smax-ack-template-save-btn')?.addEventListener('click', () => {
        prefs.ackMessageTemplate = ackTextarea?.value || '';
        savePrefs();
        if (ackStatusEl) ackStatusEl.textContent = 'Template salvo.';
      });
      container.querySelector('#smax-ack-template-reset-btn')?.addEventListener('click', () => {
        const def = PrefStore.defaults.ackMessageTemplate;
        if (ackTextarea) ackTextarea.value = def;
        prefs.ackMessageTemplate = def;
        savePrefs();
        if (ackStatusEl) ackStatusEl.textContent = 'Restaurado ao padrão.';
      });

      // Exportar / Importar Configuração JSON
      const cfgTextarea   = container.querySelector('#smax-config-io-textarea');
      const cfgStatusEl   = container.querySelector('#smax-config-io-status');
      const cfgCopyBtn    = container.querySelector('#smax-config-copy-btn');
      const cfgSaveBtn    = container.querySelector('#smax-config-save-btn');
      const pubBtn        = container.querySelector('#smax-config-publish-btn');
      const pubStatusEl   = container.querySelector('#smax-config-publish-status');
      const tokenInput    = container.querySelector('#smax-github-token-input');
      const tokenSaveBtn  = container.querySelector('#smax-github-token-save-btn');
      if (cfgTextarea) cfgTextarea.value = buildConfigJSON();
      const setCfgStatus = (msg, color) => {
        if (cfgStatusEl) { cfgStatusEl.textContent = msg; cfgStatusEl.style.color = color || 'var(--sp-text-muted)'; }
      };
      const setPubStatus = (msg, ok) => {
        if (pubStatusEl) { pubStatusEl.textContent = msg; pubStatusEl.style.color = ok === true ? '#4ade80' : ok === false ? '#fca5a5' : 'var(--sp-text-muted)'; }
      };
      tokenSaveBtn?.addEventListener('click', () => {
        prefs.githubToken = (tokenInput?.value || '').trim();
        savePrefs();
        setPubStatus('Token salvo. ✓', true);
      });
      pubBtn?.addEventListener('click', () => {
        if (pubBtn.disabled) return;
        pubBtn.disabled = true;
        const origLabel = pubBtn.textContent;
        pubBtn.textContent = '⏳ Publicando...';
        publishConfigToGit((msg, ok) => {
          setPubStatus(msg, ok);
          if (ok !== null) { pubBtn.disabled = false; pubBtn.textContent = origLabel; }
        });
      });
      cfgCopyBtn?.addEventListener('click', () => {
        if (!cfgTextarea?.value.trim()) return;
        navigator.clipboard.writeText(cfgTextarea.value)
          .then(() => setCfgStatus('Copiado! ✓', '#4ade80'))
          .catch(() => { cfgTextarea.select(); document.execCommand('copy'); setCfgStatus('Copiado! ✓', '#4ade80'); });
      });
      cfgSaveBtn?.addEventListener('click', () => {
        const raw = (cfgTextarea?.value || '').trim();
        if (!raw) { setCfgStatus('O campo está vazio.', '#fca5a5'); return; }
        const result = applyConfigJSON(raw);
        setCfgStatus(result.msg, result.ok ? '#4ade80' : '#fca5a5');
        if (result.ok) setTimeout(() => renderPanel(), 300);
      });
    };

    const wireTriagemEvents = () => {
      if (!container) return;

      // Triagem option toggles (same pattern as wireGeralEvents)
      container.querySelectorAll('.smax-module-row').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('.smax-toggle-sw')) return;
          const cb = row.querySelector('.smax-pref-toggle');
          if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        });
      });
      container.querySelectorAll('.smax-pref-toggle').forEach(cb => {
        cb.addEventListener('change', () => {
          const key = cb.dataset.key;
          if (!(key in prefs)) return;
          prefs[key] = cb.checked;
          savePrefs();
          const row = cb.closest('.smax-module-row');
          if (row) row.classList.toggle('smax-active', cb.checked);
        });
      });

      // Launch triage
      const launchBtn = container.querySelector('#smax-launch-triage-btn');
      if (launchBtn) {
        launchBtn.addEventListener('mouseenter', () => { launchBtn.style.transform = 'translateY(-2px)'; launchBtn.style.boxShadow = '0 10px 28px var(--sp-ring)'; });
        launchBtn.addEventListener('mouseleave', () => { launchBtn.style.transform = ''; launchBtn.style.boxShadow = ''; });
        launchBtn.addEventListener('click', () => {
          container.style.display = 'none';
          const bd = document.getElementById('smax-settings-backdrop');
          if (bd) bd.style.display = 'none';
          TriageHUD.open();
        });
      }

      // Log de Atividades
      const logBtn = container.querySelector('#smax-log-export-all');
      if (logBtn) logBtn.addEventListener('click', () => ActivityLog.exportCsv());
      const resetSyncBtn = container.querySelector('#smax-log-reset-syncfail');
      if (resetSyncBtn) resetSyncBtn.addEventListener('click', () => {
        ActivityLog.resetSyncFailCount();
        renderPanel();
      });
    };


    /* ── Main render ── */

    const renderPanel = () => {
      if (!container) return;

      container.innerHTML = `
        ${renderHeader()}
        <div style="display:flex;flex:1;min-height:0;overflow:hidden;">
          ${renderSidebar()}
          <div id="smax-settings-content">
            ${renderSectionContent()}
          </div>
        </div>
      `;

      // Header button events
      const themeToggleBtn = container.querySelector('#smax-theme-toggle-btn');
      if (themeToggleBtn) themeToggleBtn.addEventListener('click', ThemeManager.toggle);
      const panelCloseBtn = container.querySelector('#smax-settings-close-btn');
      if (panelCloseBtn) panelCloseBtn.addEventListener('click', () => {
        container.style.display = 'none';
        const bd = document.getElementById('smax-settings-backdrop');
        if (bd) bd.style.display = 'none';
      });

      // Sidebar navigation
      container.querySelectorAll('.smax-sidebar-item').forEach(btn => {
        btn.addEventListener('click', () => {
          activeSection = btn.dataset.section;
          editingTeamId = null;
          renderPanel();
        });
      });

      // Section event wiring
      switch (activeSection) {
        case 'geral':         wireGeralEvents();         break;
        case 'equipes':       wireTeamEvents();          break;
        case 'especialistas': break;
        case 'triagem':       wireTriagemEvents();       break;
        case 'assinaturas':   wireAssinaturasEvents();   break;
      }
    };

    const init = () => {
      if (container) return;
      toggleBtn = document.createElement('button');
      toggleBtn.id = 'smax-settings-btn';
      toggleBtn.textContent = '⚙️';
      toggleBtn.title = 'Configurações';
      Object.assign(toggleBtn.style, { position: 'fixed', right: '12px', bottom: '12px', zIndex: 999999, border: 'none' });
      document.body.appendChild(toggleBtn);

      const backdropEl = document.createElement('div');
      backdropEl.id = 'smax-settings-backdrop';
      backdropEl.style.cssText = 'position:fixed;inset:0;z-index:999998;display:none;background:rgba(0,0,0,0.38);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);transition:opacity .2s;';
      document.body.appendChild(backdropEl);

      container = document.createElement('div');
      container.id = 'smax-settings';
      Object.assign(container.style, {
        position: 'fixed',
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        zIndex: '999999',
        borderRadius: '0',
        boxShadow: 'none',
        display: 'none',
        fontSize: '14px',
        flexDirection: 'column',
        overflow: 'hidden',
      });
      document.body.appendChild(container);

      const openPanel = () => {
        DataRepository.ensurePeopleLoaded();
        reloadConfig();
        renderPanel();
        container.style.display = 'flex';
        backdropEl.style.display = 'block';
        ThemeManager.init();
      };
      _openPanel = openPanel;
      const closePanel = () => {
        container.style.display = 'none';
        backdropEl.style.display = 'none';
      };

      backdropEl.addEventListener('click', closePanel);

      // ESC fecha o painel de configurações
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && container && container.style.display === 'flex') closePanel();
      });

      toggleBtn.addEventListener('click', () => {
        const visible = container.style.display === 'flex';
        if (!visible) openPanel(); else closePanel();
      });
    };

    return { init, renderPanel, open: () => { if (_openPanel) _openPanel(); } };
  })();

  const GridTracker        = (() => {
    let needsRebuild = false;
    const markDirty  = () => { needsRebuild = true; };
    const consume    = () => { const f = needsRebuild; needsRebuild = false; return f; };
    const init       = () => {};
    DataRepository.onQueueUpdate(markDirty);
    return { init, consume, markDirty };
  })();

  /* =========================================================
   * Shared status maps (TriageHUD + SettingsPanel)
   * =======================================================*/
  const REQUEST_STATUS_LABELS = {
    RequestStatusNew:                         'Novo',
    RequestStatusReady:                       'Pronto',
    RequestStatusInProgress:                  'Em Andamento',
    RequestStatusPending:                     'Usuário Final Pendente',
    RequestStatusSuspended:                   'Suspenso',
    RequestStatusComplete:                    'Concluído',
    RequestStatusPendingParent:               'Elemento Primário Pendente',
    RequestStatusRejected:                    'Rejeitado',
    RequestStatusCancelled:                   'Cancelado',
    RequestStatusPendingVendor:               'Fornecedor Pendente',
    RequestStatusPendingExternalServiceDesk:  'Central de Serviços Externa Pendente',
    RequestStatusPendingSpecialOperation:     'Operação Especial Pendente',
    RequestStatusActive:                      'Ativo',
    RequestStatusAccepted:                    'Aceito',
    RequestStatusReject:                      'Rejeitado',
    RequestStatusPendingApproval:             'Aguardando Aprovação',
    RequestStatusPendingCustomer:             'Aguardando Solicitante',
    RequestStatusClassify:                    'Classificar',
    RequestStatusAbandon:                     'Abandonado',
    RequestStatusPendingChange:               'Aguardando Mudança',
    DecursoDePrazo_c:                         'Decurso de Prazo',
  };

  const STATUS_SCCD_LABELS = {
    Agendado_c:                              'Agendado',
    Aguardando3Nivel_c:                      'Aguardando 3º Nível',
    AguardandoAceiteDefinitivo_c:            'Aguardando Aceite Definitivo',
    AguardandoAceiteCancelamento_c:          'Aguardando Aceite do Cancelamento',
    AguardandoAtendimento_c:                 'Aguardando Atendimento',
    AguardandoCliente_c:                     'Aguardando Cliente',
    AguardandoClienteContato1_c:             'Aguardando Cliente – Contato 1',
    AguardandoClienteContato1DiaZero_c:      'Aguardando Cliente – Contato 1 (Dia Zero)',
    AguardandoClienteContato2_c:             'Aguardando Cliente – Contato 2',
    AguardandoClienteContato3_c:             'Aguardando Cliente – Contato 3',
    AguardandoColeta_c:                      'Aguardando Coleta',
    AguardandoContinuidadeAtendimento_c:     'Aguardando Continuidade de Atendimento',
    AguardandoDocumentacao_c:                'Aguardando Documentação',
    AguardandoEquipeConfiguracao_c:          'Aguardando Equipe de Configuração',
    AguardandoGarantiaFabricante_c:          'Aguardando Garantia do Fabricante',
    AguardandoInformacaoProcedimento_c:      'Aguardando Informação de Procedimento',
    AguardandoInstalacaoProducao_c:          'Aguardando Instalação em Produção',
    AguardandoOutraEquipe_c:                 'Aguardando Outra Equipe',
    AguardandoPeca_c:                        'Aguardando Peça',
    AguardandoRetornoCliente_c:              'Aguardando Retorno do Cliente',
    AguardandoRetornoFornecedor_c:           'Aguardando Retorno do Fornecedor',
    AguardandoSTI_c:                         'Aguardando STI',
    ATUALIZADOUSUARIOTEAMS_c:                'Atualizado pelo Usuário do Teams',
    DevolucaoFaltaSubsidio_c:                'Devolução falta de subsídio',
    DevolucaoAtendimentoIT2B_c:              'Devolução para Atendimento IT2B',
    AnaliseATIPG_c:                          'Em Análise ATIPG',
    EmAnaliseEmpresa_c:                      'Em Análise Empresa',
    AnaliseSAAB_c:                           'Em Análise SAAB',
    EmAnaliseTJSP_c:                         'Em Análise TJSP',
    EmAtendimento_c:                         'Em Atendimento',
    EmRota_c:                                'Em Rota',
    EnviaGSE_c:                              'Envia para GSE',
    EnviadoReparoExterno_c:                  'Enviado para Reparo Externo',
    EquipamentoEnviadoReparo_c:              'Equipamento Enviado para Reparo',
    ErroIntegracao_c:                        'Erro na Integração',
    Fechado_c:                               'Fechado',
    DecursoPrazo_c:                          'Fechado por Decurso de Prazo',
    DecursoDePrazo_c:                        'Fechado por Decurso de Prazo',
    GarantiaRecusada_c:                      'Garantia Recusada',
    LaudoDescarte_c:                         'Laudo para Descarte',
    MetricaAguardando_c:                     'Métricas - Aguardando',
    MetricaCancelada_c:                      'Métricas - Cancelada',
    MetricaAnalisa_c:                        'Métricas - Em Análise',
    MetricaEmExecucao_c:                     'Métricas - Em Execução',
    MetricaHomologada_c:                     'Métricas - Homologada',
    MetricaRejeitada_c:                      'Métricas - Rejeitada',
    PecaDevolvida_c:                         'Peça Devolvida',
    PecaEnviada_c:                           'Peça Enviada',
    PedidoPeca_c:                            'Pedido de Peça',
    PedidoPecaComBackup_c:                   'Pedido de Peça com Backup',
    PedidoRecategorizacao_c:                 'Pedido de Recategorização',
    RatAnexada_c:                            'Rat Anexada',
    ReparoLaboratorio_c:                     'Reparo em Laboratório',
    RetornoAnalise_c:                        'Retorno Análise',
    RetornoAtividade_c:                      'Retorno de Atividade',
    TarefaConcluidaLogista_c:                'Tarefa Concluída Logística',
    TarefaConcluidaParcialLogisti_c:         'Tarefa Concluída Parcial Logística',
  };

  const humanReadableStatus = (raw) => {
    if (!raw) return '';
    if (REQUEST_STATUS_LABELS[raw]) return REQUEST_STATUS_LABELS[raw];
    return raw.replace(/^RequestStatus/i, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  };

  /* =========================================================
   * Triage HUD
   * =======================================================*/
  const TriageHUD = (() => {
    const quickReplyCompletionCode = 'CompletionCodeFulfilled';
    let startBtn;
    let backdrop;
    let triageQueue = [];
    let triageIndex = -1;
    const stagedState = {
      urgency: null,
      assign: false,
      assignPersonId: '',
      parentId: '',
      parentSelected: false,
      assignmentGroupId: '',
      assignmentGroupName: '',
      assignmentGroupSelected: false,
      selectedTeamId: '',
      selectedWorkerId: '',
      stagedStatus: ''  // raw SMAX status key chosen by the user, empty = no change
    };
    let quickReplyHtml = '';
    let _triageSavedRange = null;
    let activeTicketId = null;
    let editorBaselineHtml = '';
    let quickReplyDirtyState = false;
    let baselineSyncTimer = null;
    let currentOwnerName = '';
    let personalFinalsSet = new Set(Utils.parseDigitRanges(prefs.personalFinalsRaw || ''));
    let attachmentsFetchSeq = 0;
    let currentAttachmentList = [];
    const inlineAttachmentHints = new Map();
    let queueSyncPromise = null;
    let supportGroupOptions = DataRepository.getSupportGroupsSnapshot ? DataRepository.getSupportGroupsSnapshot() : [];
    let supportGroupLoading = false;
    let supportGroupError = '';
    let currentAssignmentGroupId = '';
    let currentAssignmentGroupName = '';
    let supportGroupFilter = '';
    let gseDropdownOpen = false;
    let gseOutsideHandler = null;

    const normalizeSupportGroupText = (value) => Utils.normalizeText(value).toLowerCase();

    const getSupportGroupFilterTokens = () => {
      const normalized = normalizeSupportGroupText(supportGroupFilter).trim();
      if (!normalized) return [];
      return normalized.split(/\s+/).filter(Boolean);
    };

    const filterSupportGroupOptions = (tokens = getSupportGroupFilterTokens()) => {
      const source = Array.isArray(supportGroupOptions) ? supportGroupOptions : [];
      if (!tokens.length) return source.slice();
      return source.filter((group) => {
        if (!group) return false;
        const haystack = normalizeSupportGroupText(`${group.name || ''} ${group.id || ''}`);
        return tokens.every((token) => haystack.includes(token));
      });
    };

    const resolveSupportGroupLabel = (groupId) => {
      if (!groupId) return '';
      if (stagedState.assignmentGroupSelected && stagedState.assignmentGroupId === groupId && stagedState.assignmentGroupName) {
        return stagedState.assignmentGroupName;
      }
      if (currentAssignmentGroupId === groupId && currentAssignmentGroupName) {
        return currentAssignmentGroupName;
      }
      const list = Array.isArray(supportGroupOptions) ? supportGroupOptions : [];
      const match = list.find((group) => group && group.id === groupId);
      return match ? (match.name || '') : '';
    };

    DataRepository.onQueueUpdate(() => inlineAttachmentHints.clear());
    DataRepository.onPeopleUpdate(() => {
      if (!backdrop || backdrop.style.display !== 'flex') return;
      refreshButtons();
    });
    if (typeof DataRepository.onSupportGroupsUpdate === 'function') {
      DataRepository.onSupportGroupsUpdate((list) => {
        supportGroupOptions = Array.isArray(list) ? list : [];
        supportGroupLoading = false;
        supportGroupError = '';
        refreshGseSelect();
      });
    }

    const parseHtmlForAttachmentRefs = (html, hints) => {
      if (!html || !hints) return;
      const container = document.createElement('div');
      container.innerHTML = String(html);
      const nodes = container.querySelectorAll('[src],[href]');
      nodes.forEach((node) => {
        const raw = node.getAttribute('src') || node.getAttribute('href');
        if (!raw) return;
        const absolute = raw.startsWith('http') ? raw : Utils.toAbsoluteUrl(raw);
        const ids = new Set();
        const directMatch = absolute.match(/Attachment(?:%3A|:|\/)([a-z0-9-]{6,})/i);
        if (directMatch) ids.add(directMatch[1]);
        try {
          const parsed = new URL(absolute, window.location.origin);
          const param = parsed.searchParams.get('attachmentId');
          if (param) ids.add(param.replace(/^Attachment:/i, ''));
        } catch { }
        ids.forEach((rawId) => {
          const clean = Utils.normalizeAttachmentId(rawId);
          if (!clean) return;
          hints.ids.add(clean);
          if (!hints.urlById.has(clean)) hints.urlById.set(clean, absolute);
        });
      });
    };

    const getInlineAttachmentHints = (requestId) => {
      const normalized = Utils.normalizeRequestId(requestId);
      if (!normalized) return { ids: new Set(), urlById: new Map() };
      if (inlineAttachmentHints.has(normalized)) return inlineAttachmentHints.get(normalized);
      const hints = { ids: new Set(), urlById: new Map() };
      const cache = DataRepository.triageCache;
      if (cache && cache.has(normalized)) {
        const entry = cache.get(normalized) || {};
        parseHtmlForAttachmentRefs(entry.descriptionHtml, hints);
        parseHtmlForAttachmentRefs(entry.solutionHtml, hints);
        if (Array.isArray(entry.discussions)) entry.discussions.forEach((disc) => parseHtmlForAttachmentRefs(disc && disc.bodyHtml, hints));
      }
      inlineAttachmentHints.set(normalized, hints);
      return hints;
    };

    const applyInlineAttachmentFilter = (list, requestId) => {
      if (!Array.isArray(list)) return { filtered: [], removed: 0 };
      const hints = getInlineAttachmentHints(requestId);
      if (!hints.ids.size) return { filtered: list, removed: 0 };
      const filtered = list.filter((item) => !hints.ids.has(Utils.normalizeAttachmentId(item.id)));
      return { filtered, removed: list.length - filtered.length };
    };

    const urgencyMap = {
      low: { Urgency: 'NoDisruption', ImpactScope: 'SingleUser' },
      med: { Urgency: 'SlightDisruption', ImpactScope: 'SiteOrDepartment' },
      high: { Urgency: 'TotalLossOfService', ImpactScope: 'SiteOrDepartment' },
      crit: { Urgency: 'TotalLossOfService', ImpactScope: 'Enterprise' }
    };

    // Statuses exposed to the user in the dropdown (subset of the full map)
    const EDITABLE_STATUSES = [
      'RequestStatusSuspended',
      'RequestStatusInProgress',
      'RequestStatusReady',
      'RequestStatusPending',
      'RequestStatusReject',
      'RequestStatusComplete'
    ];

    let currentTicketOriginalStatus = ''; // tracks the ticket's API status so user can revert

    const getQuickReplyField = () => (backdrop ? backdrop.querySelector('#smax-triage-quickreply-editor') : null);

    const setQuickReplyHtml = (html, { syncBaseline = false } = {}) => {
      quickReplyHtml = html || '';
      const field = getQuickReplyField();
      if (field) field.innerHTML = quickReplyHtml;
      if (syncBaseline) {
        editorBaselineHtml = Utils.normalizeHtml(quickReplyHtml);
        updateQuickReplyStageState();
      } else {
        syncBaselineFromEditor({ immediate: true });
      }
    };

    const readQuickReplyHtml = () => {
      const field = getQuickReplyField();
      return field ? field.innerHTML : '';
    };

    const clearQuickReplyState = () => {
      setQuickReplyHtml('', { syncBaseline: true });
    };

    const syncQuickReplyBaseline = (html) => {
      const safe = html != null ? String(html) : '';
      setQuickReplyHtml(safe, { syncBaseline: true });
    };

    const hasUnsavedSolution = () => Utils.normalizeHtml(readQuickReplyHtml()) !== editorBaselineHtml;

    const syncBaselineFromEditor = ({ immediate = false } = {}) => {
      if (baselineSyncTimer) clearTimeout(baselineSyncTimer);
      const apply = () => {
        baselineSyncTimer = null;
        editorBaselineHtml = Utils.normalizeHtml(readQuickReplyHtml());
        updateQuickReplyStageState();
      };
      if (immediate) {
        apply();
        return;
      }
      baselineSyncTimer = setTimeout(apply, 80);
    };

    const updateQuickReplyStageState = ({ announce = false } = {}) => {
      const staged = hasUnsavedSolution();
      if (backdrop) {
        const card = backdrop.querySelector('#smax-triage-quickreply-card');
        if (card) card.dataset.staged = staged ? 'true' : 'false';
      }
      if (backdrop && announce && staged && !quickReplyDirtyState) {
        setStatus('Resposta pronta. Use ENVIAR para gravá-la no chamado.', 3500);
      }
      quickReplyDirtyState = staged;
      if (backdrop) {
        refreshButtons();
        setBaselineStatus();
      }
    };

    const handleQuickReplyChange = (nextHtml) => {
      quickReplyHtml = nextHtml != null ? nextHtml : readQuickReplyHtml();
      updateQuickReplyStageState({ announce: true });
    };


    const refreshPersonalFinalsSet = () => {
      personalFinalsSet = new Set(Utils.parseDigitRanges(prefs.personalFinalsRaw || ''));
    };

    const updateAttachmentPanel = ({ state, items = [], message } = {}) => {
      if (!backdrop) return;
      const listEl = backdrop.querySelector('#smax-triage-attachment-list');
      const row = backdrop.querySelector('#smax-triage-status-row');
      if (!listEl) return;
      if (state === 'loading') {
        currentAttachmentList = [];
        listEl.dataset.state = 'loading';
        listEl.textContent = 'Carregando anexos...';
        if (row) row.dataset.empty = 'true';
        return;
      }
      if (state === 'error') {
        currentAttachmentList = [];
        listEl.dataset.state = 'error';
        listEl.textContent = 'Não consegui carregar os anexos deste chamado.';
        if (row) row.dataset.empty = 'true';
        return;
      }
      if (!items.length) {
        currentAttachmentList = [];
        listEl.dataset.state = 'empty';
        listEl.textContent = message || 'Sem anexos.';
        if (row) row.dataset.empty = 'true';
        return;
      }
      currentAttachmentList = items;
      listEl.dataset.state = 'ready';
      listEl.innerHTML = items.map((att) => `
        <button type="button" class="smax-attachment-chip" data-attachment-id="${Utils.escapeHtml(att.id)}" title="${Utils.escapeHtml(att.name)}">
          ${Utils.escapeHtml(att.name)}
        </button>
      `).join('');
      if (row) row.dataset.empty = 'false';
    };
    const currentGseSelectValue = () => (stagedState.assignmentGroupSelected ? stagedState.assignmentGroupId : currentAssignmentGroupId || '');
    const refreshGseSelect = () => {
      if (!backdrop) return;
      const wrapper = backdrop.querySelector('#smax-triage-gse-wrapper');
      const displayBtn = backdrop.querySelector('#smax-triage-gse-display');
      const labelEl = backdrop.querySelector('#smax-triage-gse-display-label');
      const dropdown = backdrop.querySelector('#smax-triage-gse-dropdown');
      const optionsEl = backdrop.querySelector('#smax-triage-gse-options');
      const emptyEl = backdrop.querySelector('#smax-triage-gse-empty');
      const filterInput = backdrop.querySelector('#smax-triage-gse-filter');
      if (!wrapper || !displayBtn || !labelEl || !dropdown || !optionsEl || !emptyEl || !filterInput) return;
      if (filterInput.value !== supportGroupFilter) filterInput.value = supportGroupFilter;

      const activeValue = currentGseSelectValue();
      const filterTokens = getSupportGroupFilterTokens();
      const filteredOptions = filterSupportGroupOptions(filterTokens);
      const isFiltering = filterTokens.length > 0;
      let renderList = filteredOptions.slice();

      if (activeValue) {
        const exists = renderList.some((group) => group && group.id === activeValue);
        if (!exists) {
          const fallbackLabel = resolveSupportGroupLabel(activeValue) || 'GSE selecionado';
          renderList.unshift({ id: activeValue, name: fallbackLabel, forced: isFiltering });
        }
      }

      if (renderList.length || activeValue) {
        const clearLabel = activeValue ? 'Remover seleção (padrão)' : 'Selecionar GSE...';
        renderList.unshift({ id: '', name: clearLabel, ghost: true });
      }

      const fragments = [];
      renderList.forEach((group) => {
        if (!group || group.id == null) return;
        const rawValue = String(group.id);
        const value = rawValue.trim();
        const label = group.name || (value ? `Grupo ${value}` : 'Sem GSE');
        const active = value && activeValue && value === activeValue;
        const forcedChip = group.forced && isFiltering ? '<span class="smax-triage-gse-chip">Selecionado</span>' : '';
        fragments.push(`
          <button type="button" role="option" class="smax-triage-gse-option" data-value="${Utils.escapeHtml(value)}" data-label="${Utils.escapeHtml(label)}" data-active="${active ? 'true' : 'false'}" data-ghost="${group.ghost ? 'true' : 'false'}">
            <span class="smax-triage-gse-option-name">${Utils.escapeHtml(label)}</span>
            ${forcedChip}
          </button>
        `);
      });

      const noOptions = !fragments.length;
      if (noOptions) {
        optionsEl.innerHTML = '';
        optionsEl.dataset.empty = 'true';
        emptyEl.style.display = 'block';
        if (!supportGroupOptions.length && supportGroupLoading) emptyEl.textContent = 'Carregando GSEs...';
        else if (supportGroupError) emptyEl.textContent = supportGroupError;
        else if (isFiltering) emptyEl.textContent = 'Nenhum GSE corresponde ao filtro.';
        else emptyEl.textContent = 'Nenhum GSE disponível.';
      } else {
        optionsEl.innerHTML = fragments.join('');
        optionsEl.dataset.empty = 'false';
        emptyEl.style.display = 'none';
      }

      let displayLabel = 'Selecionar GSE...';
      if (activeValue) {
        displayLabel = resolveSupportGroupLabel(activeValue) || `Grupo ${activeValue}`;
      } else if (!renderList.length && supportGroupLoading) {
        displayLabel = 'Carregando GSEs...';
      }
      labelEl.textContent = displayLabel;

      const allowToggle = !(!supportGroupOptions.length && !activeValue && supportGroupLoading);
      displayBtn.disabled = !allowToggle;
      if (!allowToggle && gseDropdownOpen) closeGseDropdown();

      if (wrapper) {
        if (stagedState.assignmentGroupSelected) wrapper.dataset.state = 'staged';
        else if (supportGroupLoading && !supportGroupOptions.length && !activeValue) wrapper.dataset.state = 'loading';
        else if (activeValue) wrapper.dataset.state = 'ready';
        else if (renderList.length) wrapper.dataset.state = 'ready';
        else wrapper.dataset.state = 'empty';
      }
    };
    const ensureSupportGroupsReady = () => {
      if (supportGroupOptions.length || supportGroupLoading) return;
      supportGroupLoading = true;
      supportGroupError = '';
      refreshGseSelect();
      if (typeof DataRepository.ensureSupportGroups === 'function') {
        DataRepository.ensureSupportGroups({ force: false })
          .catch((err) => {
            console.warn('[SMAX] Falha ao carregar lista de GSEs:', err);
            supportGroupError = 'Falha ao carregar GSEs.';
          })
          .finally(() => {
            supportGroupLoading = false;
            refreshGseSelect();
          });
      }
    };
    const stageAssignmentGroup = (groupId, groupName) => {
      const trimmedId = groupId ? String(groupId).trim() : '';
      const trimmedName = groupName ? groupName.trim() : '';
      if (trimmedId && trimmedId !== currentAssignmentGroupId) {
        stagedState.assignmentGroupId = trimmedId;
        stagedState.assignmentGroupName = trimmedName || (supportGroupOptions.find((g) => g.id === trimmedId)?.name) || '';
        stagedState.assignmentGroupSelected = true;
      } else {
        stagedState.assignmentGroupId = '';
        stagedState.assignmentGroupName = '';
        stagedState.assignmentGroupSelected = false;
      }
      refreshGseSelect();
      refreshButtons();
      setBaselineStatus();
    };
    const handleGseOptionClick = (evt) => {
      if (!backdrop) return;
      const button = evt.target.closest('.smax-triage-gse-option');
      if (!button) return;
      const value = button.dataset.value || '';
      const label = button.dataset.label || button.textContent.trim();
      stageAssignmentGroup(value, label);
      closeGseDropdown({ focusButton: true });
    };
    const handleGseFilterInput = () => {
      if (!backdrop) return;
      const input = backdrop.querySelector('#smax-triage-gse-filter');
      if (!input) return;
      if (input.value.length > 80) input.value = input.value.slice(0, 80);
      supportGroupFilter = input.value;
      refreshGseSelect();
      ensureSupportGroupsReady();
    };
    const handleGseDropdownKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeGseDropdown({ focusButton: true });
      }
    };
    function closeGseDropdown({ focusButton = false } = {}) {
      if (!backdrop) return;
      const wrapper = backdrop.querySelector('#smax-triage-gse-wrapper');
      const displayBtn = backdrop.querySelector('#smax-triage-gse-display');
      if (wrapper) wrapper.dataset.open = 'false';
      if (!gseDropdownOpen) return;
      gseDropdownOpen = false;
      if (gseOutsideHandler) {
        document.removeEventListener('mousedown', gseOutsideHandler, true);
        document.removeEventListener('touchstart', gseOutsideHandler, true);
        gseOutsideHandler = null;
      }
      if (focusButton && displayBtn) displayBtn.focus();
    }
    function openGseDropdown() {
      if (!backdrop || gseDropdownOpen) return;
      const wrapper = backdrop.querySelector('#smax-triage-gse-wrapper');
      const filterInput = backdrop.querySelector('#smax-triage-gse-filter');
      if (!wrapper) return;
      gseDropdownOpen = true;
      wrapper.dataset.open = 'true';
      if (!gseOutsideHandler) {
        gseOutsideHandler = (evt) => {
          if (!wrapper.contains(evt.target)) closeGseDropdown();
        };
        document.addEventListener('mousedown', gseOutsideHandler, true);
        document.addEventListener('touchstart', gseOutsideHandler, true);
      }
      ensureSupportGroupsReady();
      refreshGseSelect();
      if (filterInput) {
        filterInput.focus();
        filterInput.select();
      }
    }
    const toggleGseDropdown = () => {
      if (gseDropdownOpen) closeGseDropdown();
      else openGseDropdown();
    };

    const fetchAttachmentsForRequest = (requestId) => {
      attachmentsFetchSeq += 1;
      const token = attachmentsFetchSeq;
      const normalized = Utils.normalizeRequestId(requestId);
      if (!normalized) {
        updateAttachmentPanel({ state: 'empty', items: [] });
        return;
      }
      updateAttachmentPanel({ state: 'loading' });
      AttachmentService.fetchList(normalized).then((list) => {
        if (token !== attachmentsFetchSeq) return;
        const { filtered, removed } = applyInlineAttachmentFilter(list, normalized);
        if (removed && !filtered.length) {
          updateAttachmentPanel({
            state: 'empty',
            items: [],
            message: 'Apenas imagens já embutidas na descrição/discussões.'
          });
          return;
        }
        updateAttachmentPanel({ state: 'ready', items: filtered });
      }).catch(() => {
        if (token !== attachmentsFetchSeq) return;
        updateAttachmentPanel({ state: 'error' });
      });
    };

    const finalPairFromEntry = (entry) => {
      if (!entry) return null;
      if (typeof entry.idNum === 'number' && !Number.isNaN(entry.idNum)) {
        return ((Math.abs(entry.idNum) % 100) + 100) % 100;
      }
      const trailing = Utils.extractTrailingDigits(entry.idText || '') || '';
      if (!trailing) return null;
      const slice = trailing.slice(-2);
      if (!slice) return null;
      const parsed = parseInt(slice, 10);
      if (Number.isNaN(parsed)) return null;
      return ((Math.abs(parsed) % 100) + 100) % 100;
    };

    const matchesPersonalFinals = (entry) => {
      if (!personalFinalsSet.size) return true;
      const target = finalPairFromEntry(entry);
      return target != null && personalFinalsSet.has(target);
    };

    const applyPersonalFinalsFilter = (queue) => {
      if (!personalFinalsSet.size || !Array.isArray(queue)) return queue;
      return queue.filter((entry) => matchesPersonalFinals(entry));
    };

    // CKEditor removido — editor de resposta rápida usa contenteditable + toolbar customizada

    const captureSelectedIdFromDom = () => {
      try {
        const viewport = Utils.getGridViewport();
        if (!viewport) return null;
        const row = viewport.querySelector('.slick-row.active, .slick-row.ui-state-active, .slick-row.selected');
        if (!row) return null;
        const anchor = row.querySelector('a.entity-link-id, a');
        if (anchor) return (anchor.textContent || '').trim();
        const cell = row.querySelector('.slick-cell');
        return cell ? (cell.textContent || '').trim() : null;
      } catch (err) {
        console.warn('[SMAX] Failed to capture selected row id:', err);
        return null;
      }
    };

    const buildQueue = () => {
      const snapshot = DataRepository.getTriageQueueSnapshot();
      const selectedFromDom = captureSelectedIdFromDom();
      if (snapshot.length) {
        return { list: applyPersonalFinalsFilter(snapshot.slice()), selectedId: selectedFromDom };
      }
      const viewport = Utils.getGridViewport();
      if (!viewport) return { list: [], selectedId: null };
      let idColIndex = 0;
      let createTimeColIndex = null;
      try {
        const headerColumns = document.querySelectorAll('.slick-header-column');
        headerColumns.forEach((col, idx) => {
          const aid = col.getAttribute('data-aid') || '';
          if (/grid_header_Id$/i.test(aid)) idColIndex = idx;
          if (/grid_header_CreateTime$/i.test(aid)) createTimeColIndex = idx;
        });
      } catch { }

      const rows = Array.from(viewport.querySelectorAll('.slick-row'));
      const queue = [];
      let selectedId = null;
      for (const row of rows) {
        const cells = row.querySelectorAll('.slick-cell');
        if (!cells.length) continue;
        const idCell = cells[idColIndex] || cells[0];
        const idText = (idCell.textContent || '').trim();
        const idNum = parseInt(idText.replace(/\D/g, ''), 10);
        if (!idText) continue;
        if (!selectedId && row.classList.contains('active')) selectedId = idText;
        else if (!selectedId && row.classList.contains('ui-state-active')) selectedId = idText;
        else if (!selectedId && row.classList.contains('selected')) selectedId = idText;
        let createdCell = null;
        if (createTimeColIndex != null && cells[createTimeColIndex]) {
          createdCell = cells[createTimeColIndex];
        } else {
          createdCell = Array.from(cells).find((c) => /Hora de Cria/i.test(c.getAttribute('title') || '') || /Hora de Cria/i.test(c.textContent || ''));
        }
        const createdText = createdCell ? (createdCell.textContent || '').trim() : '';
        const createdTs = Utils.parseSmaxDateTime(createdText) || 0;
        const vipCell = Array.from(cells).find((c) => /VIP/i.test(c.textContent || ''));
        const isVip = !!vipCell && /VIP/i.test(vipCell.textContent || '');
        queue.push({ idText, idNum: Number.isNaN(idNum) ? null : idNum, createdText, createdTs, isVip });
      }
      queue.sort((a, b) => {
        if (a.isVip !== b.isVip) return a.isVip ? -1 : 1;
        if (a.createdTs !== b.createdTs) return a.createdTs - b.createdTs;
        if (a.idNum != null && b.idNum != null && a.idNum !== b.idNum) return a.idNum - b.idNum;
        return 0;
      });
      return { list: applyPersonalFinalsFilter(queue), selectedId: selectedId || selectedFromDom || null };
    };

    const currentItem = () => {
      if (!triageQueue.length) return null;
      if (triageIndex < 0 || triageIndex >= triageQueue.length) return triageQueue[0];
      return triageQueue[triageIndex];
    };

    const rebuildQueueForPersonalFinals = () => {
      if (!backdrop || backdrop.style.display !== 'flex') return;
      const currentId = currentItem()?.idText || null;
      const { list } = buildQueue();
      triageQueue = list;
      if (!triageQueue.length) {
        triageIndex = -1;
      } else if (currentId) {
        const idx = triageQueue.findIndex((entry) => entry.idText === currentId);
        triageIndex = idx >= 0 ? idx : 0;
      } else {
        triageIndex = 0;
      }
      render();
    };

    const resetStaged = () => {
      stagedState.urgency = null;
      stagedState.assign = false;
      stagedState.assignPersonId = '';
      stagedState.parentId = '';
      stagedState.parentSelected = false;
      stagedState.assignmentGroupId = '';
      stagedState.assignmentGroupName = '';
      stagedState.assignmentGroupSelected = false;
      stagedState.selectedTeamId = '';
      stagedState.selectedWorkerId = '';
      stagedState.stagedStatus = '';
      currentTicketOriginalStatus = '';
      const ck = backdrop.querySelector('#smax-triage-used-script');
      if (ck) ck.checked = false;
    };

    const anyStaged = () => Boolean(
      stagedState.urgency
      || stagedState.assign
      || stagedState.parentSelected
      || stagedState.assignmentGroupSelected
      || stagedState.stagedStatus
      || hasUnsavedSolution()
    );

    const ownerForCurrent = () => {
      const item = currentItem();
      if (!item) return null;
      // Use Team-based resolution (GSE First) instead of global Distribution
      const team = TeamsConfig.suggestTeam(item);
      const worker = TeamsConfig.suggestWorker(team, item.idText || (item.idNum != null ? String(item.idNum) : ''));
      return worker ? worker.name : null;
    };

    const DISCUSSION_DATE_OPTIONS = {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    };
    const resolveSubmitterName = (entry) => {
      if (!entry) return '';
      if (entry.submitterPersonId && DataRepository.peopleCache.has(entry.submitterPersonId)) {
        const person = DataRepository.peopleCache.get(entry.submitterPersonId);
        if (person && person.name) return person.name;
      }
      if (entry.submitterDisplay) {
        const lower = entry.submitterDisplay.toLowerCase();
        if (lower !== 'agent' && lower !== 'user' && lower !== 'system') {
          return entry.submitterDisplay;
        }
      }
      return entry.submitterDisplay || '';
    };

    const buildDiscussionListMarkup = (entries) => {
      if (!Array.isArray(entries) || !entries.length) {
        return '<div class="smax-discussions-placeholder">Nenhuma discussão registrada neste chamado.</div>';
      }
      return entries.map((entry) => {
        const title = Utils.escapeHtml(entry.purposeLabel || 'Discussão');
        const privacy = Utils.escapeHtml(entry.privacyCode || '');
        const privacyLabel = Utils.escapeHtml(entry.privacyLabel || 'Interno');
        const bodyHtml = Utils.linkifyCNJ(entry.bodyHtml) || '<div style="color:var(--sp-text-muted);">(Sem conteúdo)</div>';
        const timestamp = Utils.formatBrDate(entry.createdTs, entry.createdRaw, DISCUSSION_DATE_OPTIONS, 'Data desconhecida');
        const name = resolveSubmitterName(entry);
        const authorName = name ? String(name) : (entry.submitterDisplay ? String(entry.submitterDisplay) : 'Registro manual');
        const author = entry.systemGenerated
          ? 'GERADO AUTOMATICAMENTE'
          : Utils.escapeHtml(authorName).toUpperCase();
        return `
          <article class="smax-discussion-card" data-privacy="${privacy}">
            <div class="smax-discussion-heading">
              <span class="smax-discussion-title">${title}</span>
              <span class="smax-discussion-privacy">${privacyLabel}</span>
            </div>
            <div class="smax-discussion-body">${Utils.sanitizeRichText(bodyHtml)}</div>
            <div class="smax-discussion-meta">${author} | ${timestamp}</div>
          </article>
        `;
      }).join('');
    };

    const populateTeamsDropdown = (selectedTeamId = '') => {
      if (!backdrop) return;
      const display = backdrop.querySelector('#smax-triage-team-display');
      const label = backdrop.querySelector('#smax-triage-team-label');
      const optionsEl = backdrop.querySelector('#smax-triage-team-options');
      const wrapper = backdrop.querySelector('#smax-triage-team-wrapper');
      if (!optionsEl) return;

      const teams = TeamsConfig.getTeams();
      let html = '';
      let selName = '(Sem nome)';
      teams.forEach(t => {
        const isSel = String(t.id) === String(selectedTeamId);
        const displayName = t.name || t.id || '(Sem nome)';
        if (isSel) selName = displayName;
        html += `<div class="smax-custom-dropdown-item" data-value="${Utils.escapeHtml(t.id)}" data-label="${Utils.escapeHtml(displayName)}" data-selected="${isSel ? 'true' : 'false'}">${Utils.escapeHtml(displayName)}</div>`;
      });
      optionsEl.innerHTML = html;
      display.disabled = false;
      if (label) label.textContent = selName;
      if (wrapper) wrapper.dataset.value = selectedTeamId;
      stagedState.selectedTeamId = selectedTeamId;
    };

    const populateWorkerDropdown = (teamId, selectedWorkerName = '') => {
      if (!backdrop) return;
      const display = backdrop.querySelector('#smax-triage-worker-display');
      const label = backdrop.querySelector('#smax-triage-worker-label');
      const optionsEl = backdrop.querySelector('#smax-triage-worker-options');
      const wrapper = backdrop.querySelector('#smax-triage-worker-wrapper');
      if (!optionsEl) return;

      const workers = TeamsConfig.getWorkersForTeam(teamId);
      if (!workers || !workers.length) {
        optionsEl.innerHTML = '<div class="smax-custom-dropdown-item" data-value="">(Sem atendentes)</div>';
        display.disabled = true;
        if (label) label.textContent = '(Sem atendentes)';
        stagedState.selectedWorkerId = '';
        if (wrapper) wrapper.dataset.value = '';
        return;
      }

      let html = '';
      let selName = selectedWorkerName || '(Sem atribuição)';
      workers.forEach(w => {
        const isSel = w.name === selectedWorkerName;
        if (isSel) selName = w.name;
        const rangeLabel = w.ranges ? ` <span style="color:var(--sp-text-muted);font-size:10px;">(${Utils.escapeHtml(w.ranges)})</span>` : '';
        html += `<div class="smax-custom-dropdown-item" data-value="${Utils.escapeHtml(w.name)}" data-label="${Utils.escapeHtml(w.name)}" data-selected="${isSel ? 'true' : 'false'}">
                   <span>${Utils.escapeHtml(w.name)}</span>${rangeLabel}
                 </div>`;
      });
      optionsEl.innerHTML = html;
      display.disabled = false;
      if (label) label.textContent = selName;
      if (wrapper) wrapper.dataset.value = selectedWorkerName;
      stagedState.selectedWorkerId = selectedWorkerName;
    };

    const render = (force = false) => {
      if (!backdrop) return;
      closeGseDropdown();

      const item = currentItem();
      const nextId = item ? item.idText : null;
      if (!force && activeTicketId && activeTicketId === nextId) {
        setBaselineStatus();
        return;
      }

      const ticketDetailsEl = backdrop.querySelector('#smax-triage-ticket-details');
      const discussionsEl = backdrop.querySelector('#smax-triage-discussions');
      const statusEl = backdrop.querySelector('#smax-triage-status');
      const prevBtn = backdrop.querySelector('#smax-triage-prev');
      const nextBtn = backdrop.querySelector('#smax-triage-next');
      const commitBtn = backdrop.querySelector('#smax-triage-commit');
      const inputGlobal = backdrop.querySelector('#smax-triage-global-id');
      const globalHint = backdrop.querySelector('#smax-triage-global-hint');
      const urgencyButtons = {
        low: backdrop.querySelector('#smax-triage-urg-low'),
        med: backdrop.querySelector('#smax-triage-urg-med'),
        high: backdrop.querySelector('#smax-triage-urg-high'),
        crit: backdrop.querySelector('#smax-triage-urg-crit')
      };
      const assignPanel = backdrop.querySelector('#smax-triage-assign-panel');
      const assignValue = backdrop.querySelector('#smax-triage-assign-value');

      if (!triageQueue.length) {
        triageIndex = -1;
        if (ticketDetailsEl) ticketDetailsEl.innerHTML = '<div style="font-size:14px;color:var(--sp-text);">Nenhum chamado encontrado na lista atual. Verifique o campo "meus finais", logo acima.</div>';
        if (discussionsEl) discussionsEl.innerHTML = '<div class="smax-discussions-placeholder">Nenhuma discussão disponível.</div>';
        const rawFinals = (prefs.personalFinalsRaw || '').trim();
        if (statusEl) statusEl.textContent = personalFinalsSet.size
          ? 'Nenhum chamado corresponde aos finais configurados.'
          : rawFinals
            ? '⚠️ "Meus finais" não contém dígitos válidos. Exemplo: 0-32,50'
            : 'Verifique se a visão contém ID, Descrição e Hora de Criação.';
        if (nextBtn) nextBtn.disabled = true;
        if (prevBtn) prevBtn.disabled = true;
        Object.values(urgencyButtons).forEach((btn) => { btn.disabled = true; btn.dataset.active = 'false'; });
        currentOwnerName = '';
        stagedState.assign = false;
        stagedState.parentId = '';
        stagedState.parentSelected = false;
        currentAssignmentGroupId = '';
        currentAssignmentGroupName = '';
        stageAssignmentGroup('', '');
        refreshGseSelect();
        if (assignPanel) {
          assignPanel.dataset.state = 'disabled';
          // Clear dropdowns
          const tSelect = backdrop.querySelector('#smax-triage-team-options');
          const tDisplay = backdrop.querySelector('#smax-triage-team-display');
          const wSelect = backdrop.querySelector('#smax-triage-worker-options');
          const wDisplay = backdrop.querySelector('#smax-triage-worker-display');
          if (tSelect) { tSelect.innerHTML = ''; tDisplay.disabled = true; backdrop.querySelector('#smax-triage-team-label').textContent = 'Equipe...'; }
          if (wSelect) { wSelect.innerHTML = ''; wDisplay.disabled = true; backdrop.querySelector('#smax-triage-worker-label').textContent = 'Atendente...'; }
        }
        if (inputGlobal) inputGlobal.value = '';
        if (inputGlobal) inputGlobal.dataset.state = 'inactive';
        if (globalHint) {
          globalHint.dataset.state = 'inactive';
          globalHint.textContent = 'Sem vínculo global';
        }
        if (commitBtn) commitBtn.disabled = true;
        activeTicketId = null;
        clearQuickReplyState();
        updateAttachmentPanel({ state: 'empty', items: [] });
        const statusOptions = backdrop.querySelector('#smax-triage-status-options');
        const statusDisplay = backdrop.querySelector('#smax-triage-status-display');
        if (statusOptions) { statusOptions.innerHTML = ''; statusDisplay.disabled = true; statusDisplay.dataset.status = ''; backdrop.querySelector('#smax-triage-status-label').textContent = 'Carregando...'; }
        return;
      }

      if (nextBtn) nextBtn.disabled = false;
      if (prevBtn) prevBtn.disabled = false;
      activeTicketId = nextId;
      const pendingRequestId = activeTicketId;
      resetStaged();
      currentAssignmentGroupId = '';
      currentAssignmentGroupName = '';
      stageAssignmentGroup('', '');
      refreshGseSelect();
      if (inputGlobal) {
        inputGlobal.value = '';
        inputGlobal.dataset.state = 'inactive';
      }
      if (globalHint) {
        globalHint.dataset.state = 'inactive';
        globalHint.textContent = 'Sem vínculo global';
      }
      clearQuickReplyState();
      // (removed: "Carregando solução" message — redundant with real-time loading indicators)
      updateAttachmentPanel({ state: 'loading' });

      if (ticketDetailsEl) {
        ticketDetailsEl.innerHTML = `
          <div style="font-size:14px;color:var(--sp-text);">
            Carregando detalhes completos do chamado ${item.idText || '-'}...
          </div>
        `;
      }
      if (discussionsEl) {
        discussionsEl.innerHTML = '<div class="smax-discussions-placeholder">Carregando discussões deste chamado...</div>';
      }

      DataRepository.ensureRequestPayload(pendingRequestId, { force: true }).then((full) => {
        if (!pendingRequestId || activeTicketId !== pendingRequestId) return;
        if (!full) {
          if (ticketDetailsEl) {
            ticketDetailsEl.innerHTML = `
              <div style="font-size:14px;color:var(--sp-danger-text);">
                Não foi possível carregar os detalhes completos deste chamado.
              </div>
            `;
          }
          if (discussionsEl) {
            discussionsEl.innerHTML = '<div class="smax-discussions-placeholder">Não consegui carregar as discussões deste chamado.</div>';
          }
          setStatus('Não consegui carregar a solução deste chamado.', 4000);
          updateAttachmentPanel({ state: 'error' });
          return;
        }
        const missing = [];
        if (!full.idText) missing.push('ID');
        if (!full.descriptionText && !full.subjectText) missing.push('Descrição');
        if (!full.createdText) missing.push('Hora de Criação');
        currentAssignmentGroupId = full.assignmentGroupId || '';
        currentAssignmentGroupName = full.assignmentGroupName || '';
        stageAssignmentGroup('', '');
        refreshGseSelect();
        const warning = missing.length
          ? `<div style="margin-bottom:6px;padding:6px 8px;border-radius:6px;background:var(--sp-danger-bg);color:var(--sp-danger-text);font-size:12px;">
               Aviso: faltam ${missing.join(', ')} na visão atual.
             </div>`
          : '';
        const vipBadge = full.isVip ? '<span style="margin-left:8px;padding:2px 6px;border-radius:999px;background:#facc15;color:#854d0e;font-size:11px;font-weight:700;">VIP</span>' : '';
        const requestedForHtml = full.requestedForName
          ? `<span style="color:var(--sp-text-muted);">→</span> ${Utils.escapeHtml(full.requestedForName)}`
          : '';
        // Process number (optional field) - link to eProc if CNJ format detected (formatado ou 20 dígitos brutos)
        const rawProcNum = (full.processNumber || '').trim();
        const isCNJFormatted = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(rawProcNum);
        const isCNJRaw = /^\d{20}$/.test(rawProcNum);
        const isCNJFormat = rawProcNum && (isCNJFormatted || isCNJRaw);
        const displayProcNum = isCNJFormat ? Utils.normalizeCNJ(rawProcNum) : rawProcNum;
        const processNumberHtml = rawProcNum
          ? `<span style="color:var(--sp-text-muted);">•</span> ${isCNJFormat
              ? `<span data-smax-proc="${Utils.escapeHtml(displayProcNum)}" style="color:var(--sp-accent);font-family:monospace;font-weight:600;border-bottom:1px dotted var(--sp-accent);cursor:pointer;" title="Consultar processo no eProc: ${Utils.escapeHtml(displayProcNum)}">${Utils.escapeHtml(displayProcNum)}</span>`
              : `<span style="font-family:monospace;color:var(--sp-accent);">${Utils.escapeHtml(rawProcNum)}</span>`
            }`
          : '';
        if (!ticketDetailsEl) return;
        const createdDisplay = Utils.formatBrDate(full.createdTs, full.createdText);
        const descHtml = Utils.linkifyCNJ(Utils.sanitizeRichText(full.descriptionHtml || full.descriptionText || full.subjectText || ''));
        const descDisplay = descHtml || `<span style="color:var(--sp-text-muted);">(Sem descrição disponível)</span>`;
        const idLink = full.idText
          ? `<a href="https://suporte.tjsp.jus.br/saw/Request/${encodeURIComponent(full.idText)}/general" target="_blank" rel="noreferrer noopener" style="color:var(--sp-accent);text-decoration:none;font-weight:600;">${full.idText}</a>`
          : '-';
        ticketDetailsEl.innerHTML = `
          ${warning}
          <div class="smax-triage-meta-row" style="flex-shrink:0;padding-bottom:8px;border-bottom:1px solid var(--sp-border);margin-bottom:8px;">
            ${idLink}${vipBadge}
            <span style="color:var(--sp-text-muted);">${createdDisplay}</span>
            ${requestedForHtml}
            ${processNumberHtml}
          </div>
          <div class="smax-triage-desc-scroll" style="flex:1;overflow-y:auto;color:var(--sp-text);font-size:14px;line-height:1.55;">${descDisplay}</div>
        `;

        if (discussionsEl) {
          discussionsEl.innerHTML = buildDiscussionListMarkup(Array.isArray(full.discussions) ? full.discussions : []);
        }

        const solutionHtml = full.solutionHtml != null ? full.solutionHtml : '';
        syncQuickReplyBaseline(solutionHtml);
        if (solutionHtml) setStatus('Solução atual carregada deste chamado.', 2500);
        else setBaselineStatus();

        // Calculate and set suggestions
        const suggestedTeam = TeamsConfig.suggestTeam(full);
        const suggestedTeamId = suggestedTeam ? suggestedTeam.id : '';
        const suggestedWorker = TeamsConfig.suggestWorker(suggestedTeam, full.idText || full.Id);

        populateTeamsDropdown(suggestedTeamId);
        populateWorkerDropdown(suggestedTeamId, suggestedWorker ? suggestedWorker.name : '');

        // Update location display in header
        const locationDisplayEl = backdrop.querySelector('#smax-triage-location-display');
        if (locationDisplayEl) {
          const locationName = full.locationName || '';
          if (locationName) {
            locationDisplayEl.textContent = locationName;
            locationDisplayEl.title = `Local de divulgação: ${locationName}`;
            locationDisplayEl.dataset.empty = 'false';
          } else {
            locationDisplayEl.textContent = 'Sem local';
            locationDisplayEl.title = 'Local de divulgação não disponível';
            locationDisplayEl.dataset.empty = 'true';
          }
        }

        // Update status dropdown in header
        const statusWrapper = backdrop.querySelector('#smax-triage-status-wrapper');
        const statusDisplay = backdrop.querySelector('#smax-triage-status-display');
        const statusLabel = backdrop.querySelector('#smax-triage-status-label');
        const statusOptions = backdrop.querySelector('#smax-triage-status-options');
        if (statusOptions) {
          const rawStatus = full.status || '';
          currentTicketOriginalStatus = rawStatus;
          stagedState.stagedStatus = ''; // reset on ticket change

          let optionsHtml = '';
          const editableSet = new Set(EDITABLE_STATUSES);
          let selLabel = humanReadableStatus(rawStatus) + (editableSet.has(rawStatus) ? '' : ' (atual)');

          if (rawStatus && !editableSet.has(rawStatus)) {
            optionsHtml += `<div class="smax-custom-dropdown-item" data-value="${Utils.escapeHtml(rawStatus)}" data-label="${Utils.escapeHtml(selLabel)}" data-selected="true">${Utils.escapeHtml(selLabel)}</div>`;
          }
          EDITABLE_STATUSES.forEach(key => {
            const isCurrent = key === rawStatus;
            const hr = humanReadableStatus(key);
            optionsHtml += `<div class="smax-custom-dropdown-item" data-value="${Utils.escapeHtml(key)}" data-label="${Utils.escapeHtml(hr)}" data-selected="${isCurrent ? 'true' : 'false'}">${Utils.escapeHtml(hr)}</div>`;
            if (isCurrent) selLabel = hr;
          });
          statusOptions.innerHTML = optionsHtml;
          statusDisplay.disabled = false;
          statusDisplay.dataset.status = rawStatus;
          if (statusLabel) statusLabel.textContent = selLabel;
          if (statusWrapper) statusWrapper.dataset.value = rawStatus;
        }

        // Sync assignment source-of-truth
        currentOwnerName = suggestedWorker ? suggestedWorker.name : '';

        refreshButtons(); // Update stages based on new suggestions

        fetchAttachmentsForRequest(pendingRequestId);
      });

      Object.entries(urgencyButtons).forEach(([key, btn]) => {
        btn.disabled = false;
        btn.dataset.active = 'false';
        btn.onclick = () => toggleUrgency(key);
      });

      const owner = ownerForCurrent();
      currentOwnerName = owner || '';

      if (inputGlobal && !inputGlobal.dataset.wired) {
        inputGlobal.dataset.wired = '1';
        inputGlobal.addEventListener('input', () => {
          const cleaned = inputGlobal.value.replace(/\D/g, '');
          if (cleaned !== inputGlobal.value) inputGlobal.value = cleaned;
          stagedState.parentId = inputGlobal.value.trim();
          if (!stagedState.parentId) stagedState.parentSelected = false;
          refreshButtons();
          setBaselineStatus();
        });
      }

      // Native change listeners removed, event logic delegated to backdrop click

      refreshButtons();
      setBaselineStatus();
    };

    const updateAutoStages = (quickReplyDirty) => {
      if (!backdrop) return;
      const assignPanel = backdrop.querySelector('#smax-triage-assign-panel');
      const assignValue = backdrop.querySelector('#smax-triage-assign-value');

      // Check if global parent is set — if so, ticket goes to triador, not digits-owner
      const parentId = (stagedState.parentId || '').trim();
      stagedState.parentId = parentId;
      const hasParent = !!parentId;
      stagedState.parentSelected = hasParent;

      // Global or not, the owner is always the one chosen in the HUD dropdown
      const effectiveOwner = currentOwnerName || ownerForCurrent();
      const ownerFirst = effectiveOwner ? (effectiveOwner.trim().split(/\s+/)[0] || effectiveOwner) : '';
      const effectiveDisplayName = ownerFirst || effectiveOwner || 'o dono configurado';

      const hasOwner = !!effectiveOwner;
      const urgencySet = !!stagedState.urgency;
      const resolvedPersonId = hasOwner ? DataRepository.resolvePersonId(effectiveOwner) : '';
      if (hasOwner) {
        console.debug('[SMAX][Triagem] Owner mapping check', {
          owner: effectiveOwner,
          isGlobal: hasParent,
          resolvedPersonId,
          peopleCacheSize: DataRepository.peopleCache.size
        });
      }
      stagedState.assignPersonId = resolvedPersonId;
      const hasPerson = !!resolvedPersonId;
      const readyForOwner = hasOwner && hasPerson && urgencySet && !quickReplyDirty;
      stagedState.assign = readyForOwner;

      // Update worker select staging visual
      const workerDisplay = backdrop.querySelector('#smax-triage-worker-display');
      if (workerDisplay) {
        workerDisplay.dataset.staged = readyForOwner ? 'true' : (hasOwner ? 'false' : '');
      }

      if (assignPanel && assignValue) {
        assignPanel.title = hasOwner ? `Atribuir para ${effectiveOwner}` : 'Sem dono configurado';
        if (!hasOwner) {
          assignPanel.dataset.state = 'disabled';
          assignValue.textContent = 'Sem dono configurado';
        } else if (!hasPerson) {
          assignPanel.dataset.state = 'pending';
          assignValue.textContent = 'Carregando cadastro do dono...';
        } else if (quickReplyDirty) {
          assignPanel.dataset.state = 'pending';
          assignValue.textContent = 'Resposta em edição — aguardando envio';
        } else if (!urgencySet) {
          assignPanel.dataset.state = 'pending';
          assignValue.textContent = `Defina a urgência para ${effectiveDisplayName}`;
        } else {
          assignPanel.dataset.state = 'staged';
          assignValue.textContent = hasParent
            ? `Global → atribuindo a ${effectiveDisplayName}`
            : `Pronto para ${effectiveDisplayName}`;
        }
      }

      const globalInput = backdrop.querySelector('#smax-triage-global-id');
      const globalHint = backdrop.querySelector('#smax-triage-global-hint');
      if (globalInput) globalInput.dataset.state = hasParent ? 'staged' : 'inactive';
      if (globalHint) {
        if (hasParent) {
          globalHint.dataset.state = 'staged';
          globalHint.textContent = `Vinculando ao #${parentId}`;
        } else {
          globalHint.dataset.state = 'inactive';
          globalHint.textContent = 'Sem vínculo global';
        }
      }
    };

    const refreshButtons = () => {
      if (!backdrop) return;
      const quickReplyDirty = hasUnsavedSolution();
      const urgencyButtons = {
        low: backdrop.querySelector('#smax-triage-urg-low'),
        med: backdrop.querySelector('#smax-triage-urg-med'),
        high: backdrop.querySelector('#smax-triage-urg-high'),
        crit: backdrop.querySelector('#smax-triage-urg-crit')
      };
      Object.entries(urgencyButtons).forEach(([key, btn]) => {
        if (btn) btn.dataset.active = stagedState.urgency === key ? 'true' : 'false';
      });

      updateAutoStages(quickReplyDirty);

      const commitBtn = backdrop.querySelector('#smax-triage-commit');
      if (commitBtn) {
        commitBtn.disabled = !anyStaged();
        // Determine the effective status (user-selected or ticket's current)
        const effectiveStatus = stagedState.stagedStatus || currentTicketOriginalStatus;
        const isNormalEnvio = effectiveStatus === 'RequestStatusInProgress' || effectiveStatus === 'RequestStatusReady';
        commitBtn.textContent = isNormalEnvio ? 'ENVIAR' : 'ENVIAR (Checar status)';
        commitBtn.dataset.suspended = isNormalEnvio ? 'false' : 'true';
      }
    };

    const setBaselineStatus = () => {
      if (!backdrop) return;
      if (statusLockedUntil && Date.now() < statusLockedUntil) return;
      const statusEl = backdrop.querySelector('#smax-triage-status');
      if (!statusEl) return;
      if (!triageQueue.length) {
        statusEl.textContent = 'Nenhum chamado na fila de triagem.';
        return;
      }
      const total = triageQueue.length;
      const position = Math.min(Math.max(triageIndex, 0) + 1, total);
      const stagedBits = [];
      if (stagedState.urgency) stagedBits.push('urgência');
      if (stagedState.assign) stagedBits.push('atribuir');
      if (stagedState.parentSelected && stagedState.parentId) stagedBits.push('global');
      if (stagedState.assignmentGroupSelected) stagedBits.push('GSE');
      if (stagedState.stagedStatus) stagedBits.push('status');
      if (hasUnsavedSolution()) stagedBits.push('resposta');
      const pending = stagedBits.length ? ` Pendências: ${stagedBits.join(', ')}.` : '';
      statusEl.textContent = `${position} de ${total}.${pending}`;
    };

    const toggleUrgency = (level) => {
      stagedState.urgency = stagedState.urgency === level ? null : level;
      refreshButtons();
      setBaselineStatus();
    };

    const commit = () => {
      const item = currentItem();
      if (!item) return;
      const props = { Id: String(item.idText) };
      if (stagedState.urgency) Object.assign(props, urgencyMap[stagedState.urgency]);
      const solutionHtml = hasUnsavedSolution() ? readQuickReplyHtml() : '';
      if (solutionHtml) {
        props.Solution = solutionHtml;
        props.CompletionCode = quickReplyCompletionCode;
      }
      const usedScriptCheckbox = backdrop.querySelector('#smax-triage-used-script');
      const usedScript = usedScriptCheckbox ? !!usedScriptCheckbox.checked : false;

      let expertAssigneeId = '';
      // Only set ExpertAssignee if we are explicitly assigning (stagedState.assign equal true)
      if (stagedState.assign && stagedState.assignPersonId) {
        expertAssigneeId = String(stagedState.assignPersonId);
      } else if (stagedState.assign && !stagedState.assignPersonId) {
        console.warn('[SMAX][Triagem] Assignment requested but no person ID resolved for owner.');
      }

      if (expertAssigneeId) {
        props.ExpertAssignee = expertAssigneeId;
      }
      if (stagedState.assignmentGroupSelected && stagedState.assignmentGroupId) {
        props.ExpertGroup = stagedState.assignmentGroupId;
      }
      if (stagedState.stagedStatus) {
        props.Status = stagedState.stagedStatus;
      }

      const doGlobal = stagedState.parentSelected && stagedState.parentId;
      if (!stagedState.urgency && !props.ExpertAssignee && !doGlobal && !props.Solution && !props.ExpertGroup && !props.Status) {
        setStatus('Nada para gravar.', 2500);
        return;
      }

      if (!prefs.enableRealWrites) {
        setStatus('Modo simulação ativo (Verifique Settings). Mudanças não foram gravadas.', 2500);
        advanceQueue();
        return;
      }

      setStatus('Gravando alterações...');
      const tasks = [];
      if (stagedState.urgency || props.ExpertAssignee || props.Solution || props.ExpertGroup || props.Status) tasks.push(Api.postUpdateRequest(props));
      if (doGlobal) {
        // When linking to a Global, assign the ticket to the owner chosen in the HUD (dono dos finais)
        const ownerId = stagedState.assignPersonId;

        if (!ownerId) {
          setStatus('⚠️ Dono não encontrado! Verifique a configuração de equipes.', 4000);
          return;
        }

        tasks.push(
          Api.postCreateRequestCausesRequest(stagedState.parentId, props.Id).then((relRes) => {
            if (!(relRes && relRes.meta && relRes.meta.completion_status === 'OK')) return relRes;
            // First update: set PhaseId, Status, AND assign to the chosen owner
            return Api.postUpdateRequest({
              Id: props.Id,
              PhaseId: 'Escalate',
              Status: 'RequestStatusSuspended',
              ExpertAssignee: ownerId  // Assign to dono dos finais
            }).then((firstUpdateRes) => {
              // Wait a couple seconds for server routine to complete, then set StatusSCCDSMAX_c
              // This prevents the server from overwriting it back to match the parent's status
              return new Promise((resolve) => {
                setTimeout(() => {
                  Api.postUpdateRequest({
                    Id: props.Id,
                    StatusSCCDSMAX_c: 'Aguardando3Nivel_c'
                  }).then(resolve).catch(() => resolve(firstUpdateRes));
                }, 2000); // 2 second delay to let server routine complete
              });
            });
          })
        );
      }
      Promise.allSettled(tasks).then((settled) => {
        const results = settled.map((s, idx) => {
          if (s.status === 'rejected') {
            console.warn(`[SMAX Triagem] Task ${idx} rejeitada:`, s.reason);
            return null; // summarizeBulkOutcome(null) → {ok:false, messages:['SMAX não retornou resposta.']}
          }
          return s.value;
        });
        const outcomes = results.map((payload, idx) => Api.summarizeBulkOutcome(payload, idx));
        const firstFailure = outcomes.find((entry) => !entry.ok);
        if (!firstFailure && props.Solution) {
          syncQuickReplyBaseline(props.Solution);
          if (DataRepository.updateCachedSolution) DataRepository.updateCachedSolution(props.Id, props.Solution);
        }
        if (firstFailure) {
          const detailMessage = firstFailure.messages && firstFailure.messages.length
            ? firstFailure.messages[0]
            : 'SMAX recusou a gravação.';
          console.warn('[SMAX] Falha ao gravar alterações:', { results, outcomes });
          setStatus(`SMAX recusou a gravação: ${detailMessage}`, 4000);
          // Log failed activity
          // Derive assignedTo: if answering, always prioritize myPersonName
          const logAssignedToFailed = props.Solution
            ? (prefs.myPersonName || '')
            : (props.ExpertAssignee ? (currentOwnerName || prefs.myPersonName || '') : '');
          ActivityLog.log({
            ticketId: props.Id,
            ticketSubject: DataRepository.triageCache.get(props.Id)?.subjectText || props.DisplayLabel || '',
            assigned: !!props.ExpertAssignee,
            assignedTo: logAssignedToFailed,
            globalAssigned: !!doGlobal,
            globalChangeId: doGlobal ? stagedState.parentId : '',
            transferred: !!(stagedState.assignmentGroupSelected && stagedState.assignmentGroupId && stagedState.assignmentGroupId !== currentAssignmentGroupId),
            transferredTo: (stagedState.assignmentGroupSelected && stagedState.assignmentGroupId !== currentAssignmentGroupId) ? stagedState.assignmentGroupName : '',
            answered: !!props.Solution,
            usedScript: usedScript,
            success: false
          });
        } else {
          // Capture transfer info BEFORE updating currentAssignmentGroupId
          const originalGroupId = currentAssignmentGroupId;
          const wasTransferred = stagedState.assignmentGroupSelected && stagedState.assignmentGroupId && stagedState.assignmentGroupId !== originalGroupId;
          const transferTargetName = wasTransferred ? stagedState.assignmentGroupName : '';

          if (props.ExpertGroup && stagedState.assignmentGroupSelected) {
            currentAssignmentGroupId = stagedState.assignmentGroupId;
            currentAssignmentGroupName = stagedState.assignmentGroupName || currentAssignmentGroupName;
            stageAssignmentGroup('', '');
            refreshGseSelect();
          }
          // Log successful activity
          // Derive assignedTo: if answering, always prioritize myPersonName
          const logAssignedTo = props.Solution
            ? (prefs.myPersonName || '')
            : (props.ExpertAssignee ? (currentOwnerName || prefs.myPersonName || '') : '');
          ActivityLog.log({
            ticketId: props.Id,
            ticketSubject: DataRepository.triageCache.get(props.Id)?.subjectText || props.DisplayLabel || '',
            assigned: !!props.ExpertAssignee,
            assignedTo: logAssignedTo,
            globalAssigned: !!doGlobal,
            globalChangeId: doGlobal ? stagedState.parentId : '',
            transferred: wasTransferred,
            transferredTo: transferTargetName,
            answered: !!props.Solution,
            usedScript: usedScript,
            success: true
          });
          setStatus('Alterações gravadas com sucesso.', 2000);
          advanceQueue();
        }
      }).catch((err) => {
        console.warn('[SMAX] Erro inesperado durante gravação:', err);
        setStatus('Erro ao gravar alterações.', 4000);
      });
    };

    let statusTimer = null;
    let statusLockedUntil = 0;
    const setStatus = (msg, duration = 2000) => {
      if (!backdrop) return;
      const statusEl = backdrop.querySelector('#smax-triage-status');
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusLockedUntil = Date.now() + duration;
      if (statusTimer) clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        statusTimer = null;
        statusLockedUntil = 0;
        setBaselineStatus();
      }, duration);
    };

    const syncQueueFromApi = ({ force = false, announce = false } = {}) => {
      if (queueSyncPromise && !force) return queueSyncPromise;
      if (announce && backdrop && backdrop.style.display === 'flex') setStatus('Sincronizando fila com SMAX...', 4000);
      queueSyncPromise = DataRepository.refreshQueueFromApi()
        .catch((err) => {
          console.warn('[SMAX] Falha ao sincronizar fila via API:', err);
          // Only show error if queue is actually empty — grid intercepts may have already populated it
          if (announce && backdrop && backdrop.style.display === 'flex' && !triageQueue.length) {
            setStatus('Não foi possível atualizar a fila via API.', 4000);
          }
          return null;
        })
        .finally(() => {
          queueSyncPromise = null;
          if (backdrop && backdrop.style.display === 'flex') rebuildQueueForPersonalFinals();
        });
      return queueSyncPromise;
    };

    const navigateQueue = (delta) => {
      if (hasUnsavedSolution()) {
        const discard = window.confirm('A resposta atual não foi salva. Deseja descartá-la antes de continuar?');
        if (!discard) {
          setStatus('Navegação cancelada para preservar a resposta não salva.', 3500);
          return;
        }
        clearQuickReplyState();
        setStatus('Resposta descartada. Carregando outro chamado...', 3000);
      }
      if (!triageQueue.length) {
        render();
        return;
      }

      const currentId = currentItem()?.idText || null;

      if (triageQueue.length) {
        const length = triageQueue.length;
        triageIndex = (triageIndex + delta + length) % length;
      }

      render();
    };

    const advanceQueue = () => navigateQueue(1);
    const retreatQueue = () => navigateQueue(-1);

    const updateStartBtnText = () => {
      if (!startBtn) return;
      if (activeTicketId) {
        startBtn.textContent = 'Restaurar triagem';
        startBtn.style.background = 'var(--sp-accent)';
        startBtn.style.border = '1px solid var(--sp-accent)';
        startBtn.style.boxShadow = '0 0 12px var(--sp-ring)';
      } else {
        startBtn.textContent = 'Iniciar triagem';
        startBtn.style.background = '';
        startBtn.style.border = '';
        startBtn.style.boxShadow = '';
      }
    };

    const openHud = () => {
      DataRepository.ensurePeopleLoaded();
      ensureSupportGroupsReady();
      refreshPersonalFinalsSet(); // garante sincronismo se prefs mudou via JSON import
      if (startBtn) startBtn.style.display = 'none';
      const settingsBtn = document.getElementById('smax-settings-btn');
      if (settingsBtn) settingsBtn.style.display = 'none';
      backdrop.style.display = 'flex';
      const finalsInput = backdrop.querySelector('#smax-personal-finals-input');
      if (finalsInput) finalsInput.value = prefs.personalFinalsRaw || '';
      syncQueueFromApi({ force: true, announce: true }).catch(() => { });
      const { list, selectedId } = buildQueue();
      triageQueue = list;

      if (!triageQueue.length) {
        triageIndex = -1;
      } else if (activeTicketId) {
        const focusIdx = triageQueue.findIndex((entry) => entry.idText === activeTicketId);
        triageIndex = focusIdx >= 0 ? focusIdx : 0;
      } else if (selectedId) {
        const focusIdx = triageQueue.findIndex((entry) => entry.idText === selectedId);
        triageIndex = focusIdx >= 0 ? focusIdx : 0;
      } else {
        triageIndex = 0;
      }

      render();
      const realFlag = backdrop.querySelector('#smax-triage-real-flag');
      if (realFlag) realFlag.style.display = prefs.enableRealWrites ? 'block' : 'none';
    };

    const closeHud = () => {
      backdrop.style.display = 'none';
      if (startBtn) {
        startBtn.style.display = 'block';
        updateStartBtnText();
      }
      const settingsBtn = document.getElementById('smax-settings-btn');
      if (settingsBtn) settingsBtn.style.display = '';
      closeGseDropdown();
    };

    const init = () => {
      if (backdrop) return; // já inicializado
      // Botão flutuante removido — triagem iniciada pelo painel de configurações
      startBtn = null;

      backdrop = document.createElement('div');
      backdrop.id = 'smax-triage-hud-backdrop';
      backdrop.innerHTML = `
        <div id="smax-triage-hud">
          <aside id="smax-triage-discussions">
            <div class="smax-discussions-placeholder">Inicie a triagem para carregar as discussões deste chamado.</div>
          </aside>
          <div id="smax-triage-hud-main">
            <div id="smax-triage-hud-header">
              <div class="smax-triage-title-bar">
                <label id="smax-personal-finals-label" title="Limite os chamados pelos seus dígitos finais">
                  <input type="text" id="smax-personal-finals-input" placeholder="Finais (0-32)" inputmode="numeric" autocomplete="off" />
                </label>
                <div id="smax-triage-gse-wrapper" data-state="loading" data-open="false" title="Grupo de suporte">
                  <button type="button" id="smax-triage-gse-display" disabled>
                    <span id="smax-triage-gse-display-label">Carregando GSEs...</span>
                    <span class="smax-triage-gse-chevron">▾</span>
                  </button>
                  <div id="smax-triage-gse-dropdown" role="listbox" data-empty="true">
                    <input type="text" id="smax-triage-gse-filter" placeholder="Filtrar GSE..." autocomplete="off" />
                    <div class="smax-triage-gse-options" id="smax-triage-gse-options"></div>
                    <div id="smax-triage-gse-empty">Nenhum GSE disponível.</div>
                  </div>
                </div>
                <div id="smax-triage-location-display" data-empty="true" title="Local de divulgação">Sem local</div>
                <div id="smax-triage-status-wrapper" class="smax-custom-dropdown-wrapper" data-open="false">
                  <button type="button" id="smax-triage-status-display" class="smax-custom-dropdown-display smax-triage-status-dropdown" disabled>
                    <span id="smax-triage-status-label">Carregando...</span>
                    <span class="smax-custom-chevron">▾</span>
                  </button>
                  <div class="smax-custom-dropdown-menu">
                    <div class="smax-custom-dropdown-options" id="smax-triage-status-options"></div>
                  </div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="smax-triage-header-nav">
                  <button type="button" id="smax-triage-prev" disabled aria-label="Chamado anterior" title="Chamado anterior">&#x2039;</button>
                  <button type="button" id="smax-triage-next" disabled aria-label="Próximo chamado" title="Próximo chamado">&#x203A;</button>
                </span>
                <button type="button" class="smax-triage-secondary" id="smax-triage-refresh" title="Sincronizar fila">&#x21bb;</button>
                <button type="button" id="smax-triage-back" title="Voltar para Configurações" style="padding:4px 10px;border-radius:6px;border:1px solid var(--sp-border);background:var(--sp-surface-2);color:var(--sp-text-muted);font-size:11px;cursor:pointer;white-space:nowrap;flex-shrink:0;">← Voltar</button>
                <button id="smax-theme-toggle-hud" type="button" title="Alternar tema" style="width:30px;height:30px;border-radius:6px;border:1px solid var(--sp-border);background:var(--sp-surface-2);color:var(--sp-text);font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">🌙</button>
                <button type="button" class="smax-triage-secondary" id="smax-triage-close" title="Minimizar triagem">_</button>
              </div>
            </div>
            <div id="smax-triage-hud-body">
              <div id="smax-triage-ticket-details">
                <div style="font-size:14px;color:var(--sp-text-muted);">Inicie a triagem para carregar um chamado.</div>
              </div>
            </div>
            <div id="smax-triage-hud-footer">
              <div class="smax-triage-top-row">
                <div class="smax-triage-urg-group">
                  <button type="button" class="smax-triage-secondary smax-triage-chip smax-urg-low" id="smax-triage-urg-low" disabled>Baixa</button>
                  <button type="button" class="smax-triage-secondary smax-triage-chip smax-urg-med" id="smax-triage-urg-med" disabled>Média</button>
                  <button type="button" class="smax-triage-secondary smax-triage-chip smax-urg-high" id="smax-triage-urg-high" disabled>Alta</button>
                  <button type="button" class="smax-triage-secondary smax-triage-chip smax-urg-crit" id="smax-triage-urg-crit" disabled>Crítica</button>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <div id="smax-triage-team-wrapper" class="smax-custom-dropdown-wrapper" data-open="false" style="min-width:100px;">
                    <button type="button" id="smax-triage-team-display" class="smax-custom-dropdown-display" disabled>
                      <span id="smax-triage-team-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Equipe...</span>
                      <span class="smax-custom-chevron">▾</span>
                    </button>
                    <div class="smax-custom-dropdown-menu">
                      <div class="smax-custom-dropdown-options" id="smax-triage-team-options"></div>
                    </div>
                  </div>
                  <div id="smax-triage-worker-wrapper" class="smax-custom-dropdown-wrapper" data-open="false" style="min-width:140px;">
                    <button type="button" id="smax-triage-worker-display" class="smax-custom-dropdown-display" disabled>
                      <span id="smax-triage-worker-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Atendente...</span>
                      <span class="smax-custom-chevron">▾</span>
                    </button>
                    <div class="smax-custom-dropdown-menu">
                      <div class="smax-custom-dropdown-options" id="smax-triage-worker-options"></div>
                    </div>
                  </div>
                </div>
                <input type="text" class="smax-global-input" id="smax-triage-global-id" placeholder="Global ID" inputmode="numeric" autocomplete="off" style="width:100px;" />
                <div style="display:none;" id="smax-triage-real-flag"></div>
                <div style="display:none;"><input type="checkbox" id="smax-triage-used-script"></div>
                <span class="smax-indicator-value" id="smax-triage-assign-value" style="display:none;">Sem dono configurado</span>
                <div id="smax-triage-assign-panel" data-state="disabled" style="display:none;"></div>
                <div class="smax-global-hint" id="smax-triage-global-hint" style="display:none;"></div>
                <button type="button" id="smax-triage-sig-btn" class="smax-triage-chip" title="Inserir assinatura" style="background:var(--sp-surface-2);border:1px solid var(--sp-border);color:var(--sp-text);font-size:12px;padding:4px 10px;border-radius:16px;cursor:pointer;">✒️ Assinatura</button>
                <div id="smax-triage-signature-picker" class="smax-resp-field-picker" style="display:none;"></div>
                <button type="button" class="smax-triage-primary smax-triage-chip" id="smax-triage-commit" disabled>ENVIAR</button>
              </div>
              <div id="smax-triage-quickreply-card" data-staged="false">
                <div id="smax-triage-quickreply-toolbar">
                  <button type="button" class="smax-resp-tb-btn" data-cmd="bold" title="Negrito"><b>B</b></button>
                  <button type="button" class="smax-resp-tb-btn" data-cmd="italic" title="Itálico"><i>I</i></button>
                  <button type="button" class="smax-resp-tb-btn" data-cmd="underline" title="Sublinhado"><u>U</u></button>
                  <button type="button" class="smax-resp-tb-btn" data-cmd="strikeThrough" title="Tachado"><s>S</s></button>
                  <button type="button" class="smax-resp-tb-btn" data-cmd="removeFormat" title="Limpar formatação">⊘</button>
                  <span class="smax-resp-tb-sep"></span>
                  <button type="button" class="smax-resp-tb-btn" data-cmd="insertOrderedList" title="Lista numerada">1.</button>
                  <button type="button" class="smax-resp-tb-btn" data-cmd="insertUnorderedList" title="Lista com marcadores">•</button>
                  <button type="button" class="smax-resp-tb-btn" data-cmd="indent" title="Aumentar recuo">⇥</button>
                  <button type="button" class="smax-resp-tb-btn" data-cmd="outdent" title="Diminuir recuo">⇤</button>
                  <span class="smax-resp-tb-sep"></span>
                  <button type="button" class="smax-resp-tb-btn" data-action="link" title="Inserir link">🔗</button>
                  <button type="button" class="smax-resp-tb-btn" data-cmd="unlink" title="Remover link">🔗̸</button>
                  <button type="button" class="smax-resp-tb-btn" data-cmd="insertHorizontalRule" title="Linha horizontal">―</button>
                  <span class="smax-resp-tb-sep"></span>
                  <select class="smax-resp-tb-select" id="smax-triage-tb-fontsize" title="Tamanho da fonte">
                    <option value="">Tam.</option>
                    <option value="1">8</option><option value="2">10</option><option value="3">12</option>
                    <option value="4">14</option><option value="5">18</option><option value="6">24</option><option value="7">36</option>
                  </select>
                  <label class="smax-resp-tb-label" title="Cor do texto">A <input type="color" class="smax-resp-tb-color" id="smax-triage-tb-fgcolor" value="#000000"></label>
                  <label class="smax-resp-tb-label" title="Cor de fundo">🖌 <input type="color" class="smax-resp-tb-color" id="smax-triage-tb-bgcolor" value="#ffff00"></label>
                </div>
                <div id="smax-triage-quickreply-editor" contenteditable="true" data-placeholder="Digite aqui sua resposta..."></div>
              </div>
              <div id="smax-triage-status-row" data-empty="true">
                <div id="smax-triage-status">Fila de triagem ainda não inicializada.</div>
                <div id="smax-triage-attachment-list" data-state="empty">Sem anexos.</div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      if (startBtn) startBtn.addEventListener('click', openHud);
      backdrop.querySelector('#smax-triage-close').addEventListener('click', closeHud);
      backdrop.querySelector('#smax-triage-back')?.addEventListener('click', () => { closeHud(); SettingsPanel.open(); });
      backdrop.querySelector('#smax-theme-toggle-hud')?.addEventListener('click', () => ThemeManager.toggle());
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) {
          closeHud();
          return;
        }

        const display = event.target.closest('.smax-custom-dropdown-display');
        if (display && !display.disabled) {
          const wrapper = display.closest('.smax-custom-dropdown-wrapper');
          const isOpen = wrapper.dataset.open === 'true';
          document.querySelectorAll('.smax-custom-dropdown-wrapper, #smax-triage-gse-wrapper').forEach(w => w.dataset.open = 'false');
          if (!isOpen) wrapper.dataset.open = 'true';
          return;
        }

        const item = event.target.closest('.smax-custom-dropdown-item');
        if (item) {
          const wrapper = item.closest('.smax-custom-dropdown-wrapper');
          wrapper.dataset.open = 'false';
          if (wrapper.id === 'smax-triage-team-wrapper') {
            stagedState.selectedTeamId = item.dataset.value;
            const tick = currentItem();
            const newTeam = TeamsConfig.getTeamById(stagedState.selectedTeamId);
            const suggInfo = TeamsConfig.suggestWorker(newTeam, tick ? (tick.idText || tick.idNum) : '');
            const newWorkerName = suggInfo ? suggInfo.name : '';
            populateTeamsDropdown(stagedState.selectedTeamId);
            populateWorkerDropdown(stagedState.selectedTeamId, newWorkerName);
            currentOwnerName = newWorkerName;
            stagedState.selectedWorkerId = newWorkerName;
            refreshButtons();
            setBaselineStatus();
          } else if (wrapper.id === 'smax-triage-worker-wrapper') {
            stagedState.selectedWorkerId = item.dataset.value;
            currentOwnerName = item.dataset.value;
            populateWorkerDropdown(stagedState.selectedTeamId, stagedState.selectedWorkerId);
            refreshButtons();
            setBaselineStatus();
          } else if (wrapper.id === 'smax-triage-status-wrapper') {
            const val = item.dataset.value;
            stagedState.stagedStatus = (val !== currentTicketOriginalStatus) ? val : '';
            wrapper.querySelector('.smax-custom-dropdown-display').dataset.status = val;
            wrapper.querySelector('#smax-triage-status-label').textContent = item.dataset.label;
            wrapper.querySelectorAll('.smax-custom-dropdown-item').forEach(opt => opt.dataset.selected = opt === item ? 'true' : 'false');
            refreshButtons();
            setBaselineStatus();
          }
          return;
        }

        if (!event.target.closest('.smax-custom-dropdown-wrapper') && !event.target.closest('#smax-triage-gse-wrapper')) {
          document.querySelectorAll('.smax-custom-dropdown-wrapper, #smax-triage-gse-wrapper').forEach(w => w.dataset.open = 'false');
          if (typeof closeGseDropdown === 'function') closeGseDropdown();
        }
      });
      const prevBtn = backdrop.querySelector('#smax-triage-prev');
      if (prevBtn) prevBtn.addEventListener('click', () => retreatQueue());
      backdrop.querySelector('#smax-triage-next').addEventListener('click', () => advanceQueue());
      const refreshBtn = backdrop.querySelector('#smax-triage-refresh');
      if (refreshBtn) refreshBtn.addEventListener('click', () => syncQueueFromApi({ force: true, announce: true }));
      backdrop.querySelector('#smax-triage-commit').addEventListener('click', () => commit());
      // ── Toolbar do editor de resposta rápida (contenteditable) ──
      const quickEditor = backdrop.querySelector('#smax-triage-quickreply-editor');
      if (quickEditor) {
        quickEditor.addEventListener('input', () => handleQuickReplyChange(quickEditor.innerHTML));
        document.addEventListener('selectionchange', () => {
          const sel = window.getSelection();
          if (sel && sel.rangeCount && quickEditor.contains(sel.anchorNode)) {
            _triageSavedRange = sel.getRangeAt(0).cloneRange();
          }
        });
        const restoreSel = () => {
          if (!_triageSavedRange) return;
          quickEditor.focus();
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(_triageSavedRange);
        };
        backdrop.querySelectorAll('#smax-triage-quickreply-toolbar [data-cmd]').forEach(btn => {
          btn.addEventListener('mousedown', e => e.preventDefault());
          btn.addEventListener('click', () => { restoreSel(); document.execCommand(btn.dataset.cmd, false, null); });
        });
        backdrop.querySelector('#smax-triage-quickreply-toolbar [data-action="link"]')?.addEventListener('click', () => {
          restoreSel();
          const url = prompt('URL do link:');
          if (url) document.execCommand('createLink', false, url);
        });
        const tFontSize = backdrop.querySelector('#smax-triage-tb-fontsize');
        if (tFontSize) {
          tFontSize.addEventListener('mousedown', e => e.stopPropagation());
          tFontSize.addEventListener('change', () => { restoreSel(); document.execCommand('fontSize', false, tFontSize.value); tFontSize.value = ''; });
        }
        const tFg = backdrop.querySelector('#smax-triage-tb-fgcolor');
        if (tFg) tFg.addEventListener('input', () => { restoreSel(); document.execCommand('foreColor', false, tFg.value); });
        const tBg = backdrop.querySelector('#smax-triage-tb-bgcolor');
        if (tBg) tBg.addEventListener('input', () => { restoreSel(); document.execCommand('hiliteColor', false, tBg.value); });
      }
      const attachmentListEl = backdrop.querySelector('#smax-triage-attachment-list');
      if (attachmentListEl) {
        attachmentListEl.addEventListener('click', (evt) => {
          const chip = evt.target.closest('.smax-attachment-chip');
          if (!chip) return;
          const attachment = currentAttachmentList.find((item) => item.id === chip.dataset.attachmentId);
          if (!attachment) return;
          AttachmentService.preview(attachment, currentAttachmentList);
        });
      }
      const gseDisplay = backdrop.querySelector('#smax-triage-gse-display');
      if (gseDisplay) {
        gseDisplay.addEventListener('click', () => {
          if (gseDisplay.disabled) return;
          toggleGseDropdown();
        });
      }
      const gseDropdown = backdrop.querySelector('#smax-triage-gse-dropdown');
      if (gseDropdown) {
        gseDropdown.addEventListener('click', handleGseOptionClick);
        gseDropdown.addEventListener('keydown', handleGseDropdownKeydown);
      }
      const gseFilter = backdrop.querySelector('#smax-triage-gse-filter');
      if (gseFilter) {
        gseFilter.value = supportGroupFilter;
        gseFilter.addEventListener('input', handleGseFilterInput);
        gseFilter.addEventListener('focus', ensureSupportGroupsReady);
      }
      refreshGseSelect();
      ensureSupportGroupsReady();
      const finalsInput = backdrop.querySelector('#smax-personal-finals-input');
      if (finalsInput) {
        finalsInput.value = prefs.personalFinalsRaw || '';
        finalsInput.addEventListener('input', () => {
          const cleaned = finalsInput.value.replace(/[^0-9,\-\s]/g, '');
          if (cleaned !== finalsInput.value) finalsInput.value = cleaned;
          const trimmed = cleaned.trim();
          prefs.personalFinalsRaw = trimmed;
          refreshPersonalFinalsSet();
          savePrefs();
          rebuildQueueForPersonalFinals();
          // Feedback visual: entrada preenchida mas nenhum dígito válido parseado
          if (trimmed && !personalFinalsSet.size) {
            finalsInput.style.borderColor = '#f87171';
            finalsInput.title = 'Nenhum dígito válido. Use: 0-32,50 ou 0,5,10';
          } else {
            finalsInput.style.borderColor = '';
            finalsInput.title = '';
          }
        });
      }
      rebuildQueueForPersonalFinals();


      // NOTE: team/worker select event handlers are wired inside render() with dataset.wired guards

      // ESC fecha o HUD
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && backdrop && backdrop.style.display !== 'none') closeHud();
      });

      // ── Assinatura picker no TriageHUD ──
      const triageSigBtn = backdrop.querySelector('#smax-triage-sig-btn');
      const triageSigPicker = backdrop.querySelector('#smax-triage-signature-picker');
      if (triageSigBtn && triageSigPicker) {
        triageSigBtn.addEventListener('click', () => {
          if (triageSigPicker.style.display !== 'none') { triageSigPicker.style.display = 'none'; return; }
          const sigs = SignatureManager.buildSignatureList();
          if (!sigs.length) {
            triageSigPicker.innerHTML = '<div style="padding:10px 14px;font-size:11px;color:var(--sp-text-muted);">Nenhuma assinatura configurada.<br>Vá em ⚙ Configurações → ✒️ Assinaturas.</div>';
          } else {
            triageSigPicker.innerHTML = sigs.map((s, i) => {
              const icon = s.source === 'team' ? '👥' : '👤';
              return `<div class="smax-resp-field-picker-item" data-sig-idx="${i}" style="padding:6px 12px;cursor:pointer;font-size:12px;">
                ${icon} <span>${Utils.escapeHtml(s.label)}</span>
              </div>`;
            }).join('');
            triageSigPicker.querySelectorAll('.smax-resp-field-picker-item').forEach(item => {
              item.addEventListener('click', () => {
                const idx = parseInt(item.dataset.sigIdx, 10);
                const sig = sigs[idx];
                if (sig) {
                  const editorEl = backdrop.querySelector('#smax-triage-quickreply-editor');
                  if (editorEl) SignatureManager.appendToContenteditable(editorEl, sig.html);
                }
                triageSigPicker.style.display = 'none';
              });
            });
          }
          // Position below button
          const rect = triageSigBtn.getBoundingClientRect();
          triageSigPicker.style.display = 'block';
          triageSigPicker.style.left = rect.left + 'px';
          triageSigPicker.style.top = (rect.bottom + 4) + 'px';
          triageSigPicker.style.position = 'fixed';

          const closeOnOutside = (e) => {
            if (!triageSigPicker.contains(e.target) && e.target !== triageSigBtn) {
              triageSigPicker.style.display = 'none';
              document.removeEventListener('mousedown', closeOnOutside, true);
            }
          };
          setTimeout(() => document.addEventListener('mousedown', closeOnOutside, true), 0);
        });
      }

    };

    DataRepository.onQueueUpdate(() => {
      if (!backdrop || backdrop.style.display !== 'flex') return;
      rebuildQueueForPersonalFinals();
    });

    return { init, open: openHud, close: closeHud };
  })();

  /* =========================================================
   * SharedConfig — configuração compartilhada via GitHub JSON
   * Busca um arquivo JSON público e distribui equipes e scripts
   * para toda a equipe sem banco de dados.
   * =======================================================*/
  const SharedConfig = (() => {
    const CACHE_KEY = 'smax_shared_cache';
    const TTL_MS = 60 * 60 * 1000; // 1 hora

    let data = null;
    let fetchedAt = 0;
    let statusText = '';
    let isLoading = false;

    const loadCache = () => {
      try {
        const raw = GM_getValue(CACHE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        data = saved.data || null;
        fetchedAt = saved.fetchedAt || 0;
      } catch {}
    };

    const saveCache = (d) => {
      try { GM_setValue(CACHE_KEY, JSON.stringify({ data: d, fetchedAt: Date.now() })); } catch {}
    };

    const _listeners = [];
    const onTeamsLoaded = (fn) => { if (typeof fn === 'function') _listeners.push(fn); };

    const applyToModules = () => {
      if (!data) return;
      const log = [];

      // --- Equipes ---
      if (Array.isArray(data.teams) && data.teams.length) {
        TeamsConfig.setSharedTeams(data.teams);
        DataRepository.ensurePeopleLoaded({ force: true });
        _listeners.forEach(fn => { try { fn(data.teams); } catch {} });
        log.push({ key: 'Equipes', detail: `${data.teams.length} equipe(s): ${data.teams.map(t => t.name || t.id).join(', ')}`, ok: true });
      } else if (data.teams !== undefined) {
        log.push({ key: 'Equipes', detail: 'recebido mas vazio', ok: false });
      }

      // --- Chaves de config compartilhada ---
      const SHARED_KEYS = ['nameGroups', 'ausentes', 'defaultGlobalChangeId', 'ackMessageTemplate'];
      let sharedApplied = false;

      SHARED_KEYS.forEach(key => {
        if (data[key] !== undefined) {
          prefs[key] = data[key];
          sharedApplied = true;

          if (key === 'nameGroups') {
            const groups = typeof data[key] === 'object' && data[key] ? data[key] : {};
            const count = Object.keys(groups).length;
            const totalPeople = Object.values(groups).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
            log.push({ key: 'Grupos de nomes', detail: `${count} grupo(s), ${totalPeople} pessoa(s)`, ok: count > 0 });
          } else if (key === 'ausentes') {
            const arr = Array.isArray(data[key]) ? data[key] : [];
            log.push({ key: 'Ausentes', detail: arr.length ? arr.join(', ') : '(nenhum)', ok: true });
          } else if (key === 'defaultGlobalChangeId') {
            log.push({ key: 'ID Global padrão', detail: data[key] || '(vazio)', ok: !!data[key] });
          } else if (key === 'ackMessageTemplate') {
            const tpl = data[key] || '';
            log.push({ key: 'Msg. recebimento', detail: tpl ? `"${tpl.substring(0, 60)}${tpl.length > 60 ? '…' : ''}"` : '(vazia)', ok: !!tpl });
          }
        }
      });

      // --- Teams → teamsConfigRaw ---
      if (data.teams !== undefined) {
        prefs.teamsConfigRaw = typeof data.teams === 'string' ? data.teams : JSON.stringify(data.teams);
        sharedApplied = true;
      }

      // --- Assinaturas de equipe ---
      if (data.teamSignatures !== undefined && typeof data.teamSignatures === 'object') {
        prefs.teamSignaturesRaw = JSON.stringify(data.teamSignatures);
        sharedApplied = true;
        const sigEntries = Object.entries(data.teamSignatures).filter(([, v]) => v);
        log.push({ key: 'Assinaturas de equipe', detail: `${sigEntries.length} equipe(s): ${sigEntries.map(([k]) => k).join(', ') || '(nenhuma)'}`, ok: sigEntries.length > 0 });
      }

      if (sharedApplied) { savePrefs(); }

      // Log detalhado no console
      if (log.length) {
        console.group('[SMAX SharedConfig Toolkit] Configurações importadas (v' + (data._version || '?') + ')');
        log.forEach(l => console.log(`  ${l.ok ? '✓' : '—'} ${l.key}: ${l.detail}`));
        console.groupEnd();
      } else {
        console.log('[SMAX SharedConfig Toolkit] Nenhuma configuração importada.');
      }
    };

    const refresh = (force = false) => {
      const url = (prefs.sharedConfigUrl || '').trim();
      if (!url) { statusText = 'URL não configurada.'; return Promise.resolve(null); }
      if (!force && data && (Date.now() - fetchedAt) < TTL_MS) return Promise.resolve(data);

      isLoading = true;
      statusText = 'Buscando...';

      return new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now(),
          headers: { 'Cache-Control': 'no-cache' },
          timeout: 15000,
          onload: (res) => {
            isLoading = false;
            try {
              if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
              const parsed = JSON.parse(res.responseText);
              data = parsed;
              fetchedAt = Date.now();
              saveCache(data);
              const now = new Date();
              const hm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
              statusText = `✓ v${data._version || '1'} — ${hm}`;
              console.log('[SMAX SharedConfig] carregado:', data._version, '| equipes:', (data.teams||[]).length, '| scripts sol:', (data.scripts?.sol||[]).length);
              applyToModules();
              resolve(data);
            } catch (e) {
              statusText = `Erro: ${e.message}`;
              console.warn('[SMAX SharedConfig]', e);
              resolve(data);
            }
          },
          onerror: () => { isLoading = false; statusText = 'Erro de rede (cache local em uso)'; resolve(data); },
          ontimeout: () => { isLoading = false; statusText = 'Timeout (cache local em uso)'; resolve(data); },
        });
      });
    };

    const init = () => {
      loadCache();
      if (data) {
        applyToModules(); // aplica cache imediatamente
        const ageMs = Date.now() - fetchedAt;
        if (ageMs > TTL_MS) {
          const ageMin = Math.round(ageMs / 60000);
          statusText = `⚠️ Cache desatualizado (${ageMin > 90 ? Math.round(ageMin / 60) + 'h' : ageMin + 'min'}) — atualizando...`;
        } else {
          const d = new Date(fetchedAt);
          const hm = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
          statusText = `✓ v${data._version || '1'} — cache de ${hm}`;
        }
      }
      refresh();                  // atualiza em segundo plano (sem await)
    };

    const getStatus = () => ({ text: statusText, loading: isLoading, fetchedAt });
    const get = () => data;

    return { init, refresh, get, getStatus, onTeamsLoaded };
  })();

  /* =========================================================
   * Boot
   * =======================================================*/
  const boot = () => {
    ThemeManager.init();
    SettingsPanel.init();
    TriageHUD.init();
    SharedConfig.init();
    DataRepository.refreshQueueFromApi().catch(() => { });
    DataRepository.ensureSupportGroups().catch(() => { });
  };

  Utils.onDomReady(boot);
})();

// ═══════════════════════════════════════════════════════════════════════════
// ── eProc SMAX Bridge ────────────────────────────────────────────────────
// Roda no domínio do eProc. Recebe o número de processo via postMessage
// enviado pelo script SMAX e executa a consulta dentro da sessão ativa.
// ═══════════════════════════════════════════════════════════════════════════
if (window.location.hostname === 'eproc1g.tjsp.jus.br') {
  (function () {
    'use strict';

    const SMAX_ORIGIN = 'https://suporte.tjsp.jus.br';
    const STORAGE_KEY = 'eproc_smax_bridge_proc';
    const MSG_TYPE    = 'SMAX_CONSULTAR_PROCESSO';

    const normalizeCNJ = (s) => {
      const t = (s || '').trim();
      const d = t.replace(/\D/g, '');
      return d.length === 20
        ? `${d.slice(0,7)}-${d.slice(7,9)}.${d.slice(9,13)}.${d.slice(13,14)}.${d.slice(14,16)}.${d.slice(16,20)}`
        : t;
    };

    const tryConsultar = (processNumber) => {
      // Pesquisa rápida (barra superior — presente em todas as páginas do eProc)
      const quickSearch = document.querySelector('#txtNumProcessoPesquisaRapida');
      if (quickSearch) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(quickSearch, processNumber);
        else quickSearch.value = processNumber;
        quickSearch.dispatchEvent(new Event('input',  { bubbles: true }));
        quickSearch.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[SMAX Bridge] Consultando via pesquisa rápida:', processNumber);
        setTimeout(() => {
          quickSearch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
          quickSearch.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
          quickSearch.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
          // Fallback: submete o form pai se existir
          const form = quickSearch.closest('form');
          if (form) form.submit();
        }, 200);
        return true;
      }

      // Fallback: formulário de consulta interno (páginas específicas)
      const selectors = [
        '#txtNumProcesso', '#NumProcesso',
        'input[name="num_processo"]',
        'input[id*="Processo"][type="text"]',
        'input[name*="processo"][type="text"]',
      ];
      let input = null;
      for (const s of selectors) { input = document.querySelector(s); if (input) break; }
      if (!input) return false;

      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) nativeSetter.call(input, processNumber);
      else input.value = processNumber;
      input.dispatchEvent(new Event('input',  { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      const keywords = ['pesquisar', 'consultar', 'buscar', 'localizar'];
      const candidates = [
        ...document.querySelectorAll('button[type="submit"]'),
        ...document.querySelectorAll('input[type="submit"]'),
        ...document.querySelectorAll('.infraButton'),
        ...document.querySelectorAll('.btn-primary'),
      ];
      let button = candidates.find(b => keywords.some(k => (b.textContent || b.value || '').toLowerCase().includes(k)));
      if (!button && candidates.length) button = candidates[0];
      if (!button) return false;

      console.log('[SMAX Bridge] Consultando via formulário interno:', processNumber);
      setTimeout(() => button.click(), 300);
      return true;
    };

    const consultarProcesso = (raw) => {
      const num = normalizeCNJ(raw);
      if (tryConsultar(num)) { sessionStorage.removeItem(STORAGE_KEY); return; }
      console.warn('[SMAX Bridge] Campo de pesquisa não encontrado. Número:', num);
      sessionStorage.removeItem(STORAGE_KEY);
    };

    // Listener postMessage (vindo do SMAX)
    window.addEventListener('message', (event) => {
      if (event.origin !== SMAX_ORIGIN) return;
      if (!event.data || event.data.type !== MSG_TYPE) return;
      console.log('[SMAX Bridge] Mensagem recebida:', event.data.num);
      consultarProcesso(event.data.num);
    });

    // Retomada após redirecionamento interno
    const run = () => {
      const pending = sessionStorage.getItem(STORAGE_KEY);
      if (!pending) return;
      // Só limpa o pending se a consulta foi bem-sucedida
      if (tryConsultar(pending)) sessionStorage.removeItem(STORAGE_KEY);
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();

    console.log('[SMAX Bridge] Aguardando mensagens do SMAX...');
  })();
}

