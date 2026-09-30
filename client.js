/**
 * Session delete - CLIENT half.
 *
 * Official bundle client-artifact format: a side-effecting script that
 * registers ONE lazy factory through `window.__ModuleLoader__`, whose `id`
 * must equal the package name. React comes from the browser module table via
 * the injected `require`; the UI primitives are required lazily inside the
 * slot-inject callbacks, because those only fire once the owning core bundle
 * (ui-workspace / the shell) has declared its slots - by which point the
 * primitives bundle is guaranteed registered.
 *
 * Three entries mirror the shipped archive action's architecture:
 * - a `sidebar.workspaces.session.menu.item` row ("删除会话…", danger, order
 *   500 - after the shipped archive at 400),
 * - a `sidebar.workspaces.session.row.action` hover button (order 300, the
 *   same icon-button look as the shipped archive/pin buttons),
 * - a `shell.overlay` entry that renders the confirm dialog (and the success
 *   toast) over a module-local pending-request store.
 *
 * The Host half owns the actual deletion and every safety fence; this half
 * only asks. Menu rows and hover buttons receive `{ sessionId, displayTitle }`
 * from the slot host plus the host-provided `useMenuOpenState` hook.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-session-delete',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Exact route the Host half answers. */
    const ROUTE = '/session-delete';

    /** Design-system danger color, with a fallback outside themed surfaces. */
    const DANGER = 'var(--dsw-alias-state-error-primary, #d5455c)';

    //#region module state
    /** Minimal snapshot store: get/set/subscribe over one immutable value. */
    function createSnapshotStore(initial) {
      let state = initial;
      const listeners = new Set();
      return {
        get: () => state,
        set(next) {
          state = next;
          for (const listener of [...listeners]) listener();
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    }

    /** The pending delete request: null or `{ sessionId, displayTitle, seq }`. */
    const pendingStore = createSnapshotStore(null);
    /** The post-success notice: null or `{ text, seq }`. */
    const toastStore = createSnapshotStore(null);
    let requestSeq = 0;
    let toastSeq = 0;

    /** Subscribe a component to one snapshot store. */
    const useStore = (store) => React.useSyncExternalStore(store.subscribe, store.get);

    /** Open the confirm dialog for one session row. */
    const requestDelete = (sessionId, displayTitle) => {
      if (typeof sessionId !== 'string' || sessionId === '') return;
      pendingStore.set({
        sessionId,
        displayTitle: typeof displayTitle === 'string' && displayTitle !== '' ? displayTitle : sessionId,
        seq: ++requestSeq,
      });
    };

    /** POST the delete to the Host half; resolves to `{ ok, error, code }`. */
    const callDelete = async (sessionId) => {
      try {
        const res = await fetch(ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        let body = null;
        try {
          body = await res.json();
        } catch { /* non-JSON failure falls through */ }
        if (body !== null && typeof body === 'object' && body.ok === true) return { ok: true };
        return {
          ok: false,
          error: body !== null && typeof body === 'object' && typeof body.error === 'string'
            ? body.error
            : '删除失败（HTTP ' + res.status + '）',
        };
      } catch (error) {
        return { ok: false, error: String(error && error.message ? error.message : error) };
      }
    };
    //#endregion

    //#region entries
    /**
     * Menu row (order 500, destructive colors, separated from the group):
     * opens the confirm dialog and closes the row menu.
     */
    const makeMenuItem = (ui) => function DeleteSessionMenuItem(props) {
      const sessionId = props && typeof props.sessionId === 'string' ? props.sessionId : null;
      const displayTitle = props && typeof props.displayTitle === 'string' ? props.displayTitle : '';
      const useMenuOpenState = props && typeof props.useMenuOpenState === 'function' ? props.useMenuOpenState : null;
      let setMenuOpen = null;
      if (useMenuOpenState !== null) {
        const pair = useMenuOpenState();
        if (Array.isArray(pair) && typeof pair[1] === 'function') setMenuOpen = pair[1];
      }
      if (sessionId === null) return null;
      return h(ui.MenuItemButton, {
        danger: true,
        separatorBefore: true,
        icon: h(ui.IconTrashOutlineMedium, { size: 14 }),
        onSelect: () => {
          if (setMenuOpen !== null) setMenuOpen(false);
          requestDelete(sessionId, displayTitle);
        },
      }, '删除会话…');
    };

    /**
     * Hover button (order 300, after the shipped archive/pin buttons): the
     * same 16x16 icon-button look the shipped rows use, opening the dialog.
     */
    const makeRowButton = (ui) => function DeleteSessionRowButton(props) {
      const sessionId = props && typeof props.sessionId === 'string' ? props.sessionId : null;
      const displayTitle = props && typeof props.displayTitle === 'string' ? props.displayTitle : '';
      const [hover, setHover] = React.useState(false);
      if (sessionId === null) return null;
      return h(ui.Tooltip, {
        label: '删除会话',
        side: 'bottom',
        align: 'end',
        delayMs: 500,
        children: h('button', {
          type: 'button',
          'aria-label': '删除会话',
          onClick: () => requestDelete(sessionId, displayTitle),
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          style: {
            borderRadius: 'var(--dsw-radius-xs, 4px)',
            cursor: 'pointer',
            width: '16px',
            height: '16px',
            color: hover ? 'var(--dsw-alias-label-primary, inherit)' : 'var(--dsw-alias-label-tertiary, inherit)',
            background: 'transparent',
            border: 'none',
            flex: 'none',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '0',
            display: 'inline-flex',
          },
        }, h(ui.IconTrashOutlineMedium, { size: 14 })),
      });
    };

    /**
     * The `shell.overlay` entry: nothing while no request is pending, else a
     * destructive confirm dialog (the shipped Modal/Button primitives), and
     * after success a keyed Toast notice. Errors from the Host fences render
     * inside the dialog so the refusal reason reaches the user.
     */
    const makeOverlay = (ui) => function DeleteSessionOverlay() {
      const request = useStore(pendingStore);
      const toast = useStore(toastStore);
      const [phase, setPhase] = React.useState({ busy: false, error: null });
      const requestSeqValue = request === null ? 0 : request.seq;

      // Reset the transient phase whenever a new request (or none) arrives.
      React.useEffect(() => {
        setPhase({ busy: false, error: null });
      }, [requestSeqValue]);

      const settle = () => {
        if (phase.busy) return;
        pendingStore.set(null);
      };

      const confirm = () => {
        if (phase.busy || request === null) return;
        setPhase({ busy: true, error: null });
        callDelete(request.sessionId).then((result) => {
          if (result.ok) {
            pendingStore.set(null);
            toastStore.set({ text: '已删除会话「' + request.displayTitle + '」', seq: ++toastSeq });
          } else {
            setPhase({ busy: false, error: result.error });
          }
        });
      };

      return h(React.Fragment, null,
        request !== null && h(ui.Modal, {
          open: true,
          onClose: settle,
          closeLabel: '关闭',
          title: '删除会话',
          description: '将永久删除「' + request.displayTitle + '」的完整对话记录（含磁盘日志），此操作不可恢复。',
          footer: h(React.Fragment, null,
            h(ui.Button, {
              variant: 'outline',
              disabled: phase.busy,
              onClick: settle,
            }, '取消'),
            h(ui.Button, {
              variant: 'outline',
              disabled: phase.busy,
              onClick: confirm,
              style: { color: DANGER },
            }, phase.busy ? '删除中…' : '删除')),
        }, phase.error !== null && h('div', {
          role: 'alert',
          style: { color: DANGER, fontSize: '12px', lineHeight: '17px', marginTop: '4px' },
        }, phase.error)),
        toast !== null && h(ui.Toast, {
          key: toast.seq,
          text: toast.text,
          onDone: () => toastStore.set(null),
        }));
    };
    //#endregion

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => {
          const ui = require('@deepseek-ai/dsh-client-ui-primitives');
          return ctx.slots.register({
            name: 'sidebar.workspaces.session.menu.item',
            id: 'dsh-session-delete-menu',
            order: 500,
            inject: () => ({ requestDelete }),
          }, makeMenuItem(ui));
        });
        ctx.slots.inject('sidebar.workspaces.session.row.action', () => {
          const ui = require('@deepseek-ai/dsh-client-ui-primitives');
          return ctx.slots.register({
            name: 'sidebar.workspaces.session.row.action',
            id: 'dsh-session-delete-row',
            order: 300,
            inject: () => ({ requestDelete }),
          }, makeRowButton(ui));
        });
        ctx.slots.inject('shell.overlay', () => {
          const ui = require('@deepseek-ai/dsh-client-ui-primitives');
          return ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-session-delete-dialog',
            inject: () => ({}),
          }, makeOverlay(ui));
        });
      },
    };
  },
});
