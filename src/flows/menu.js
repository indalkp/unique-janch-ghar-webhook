/**
 * src/flows/menu.js — Top-level welcome + menu (v2.2).
 *
 * v2.2: send TWO messages back-to-back so the former-name line lands at the
 * top of the chat. The List-message header is capped at 60 chars by Meta and
 * was truncating the rebrand line, so we lift the welcome text into a plain
 * text message and use a short header on the List for the menu rows.
 *
 *   1. sendText(welcome.text)         — full bilingual greeting + former name
 *   2. sendInteractiveList(menu.title.short, menu.body, ...) — the 5 rows
 *
 * Each is awaited; both are logged via actions.metaPost.
 */

'use strict';

const { sendText, sendInteractiveList } = require('../actions');
const { setState } = require('../state');
const { t } = require('../lang');

/**
 * Show the main menu. Sets state.flow='idle' so the next inbound row pick
 * is treated as a fresh entry point.
 *
 * @param {string} wa_id
 * @param {'hi'|'en'} lang
 */
async function showMenu(wa_id, lang) {
  // 1) Plain text greeting (no length cap) — keeps the former-name line visible.
  await sendText(wa_id, t('welcome.text', lang));

  // 2) List message with a short header so the title fits within 60 chars.
  const sections = [
    {
      title: t('menu.section.title', lang),
      rows: [
        { id: 'book',    title: t('menu.book',    lang), description: t('menu.book.desc',    lang) },
        { id: 'status',  title: t('menu.status',  lang), description: t('menu.status.desc',  lang) },
        { id: 'catalog', title: t('menu.catalog', lang), description: t('menu.catalog.desc', lang) },
        { id: 'info',    title: t('menu.info',    lang), description: t('menu.info.desc',    lang) },
        { id: 'handoff', title: t('menu.handoff', lang), description: t('menu.handoff.desc', lang) },
      ],
    },
  ];

  await sendInteractiveList(
    wa_id,
    t('menu.title.short', lang),
    t('menu.body', lang),
    t('menu.button', lang),
    sections,
  );

  // Mark the customer as "at menu" — next click will enter a flow.
  await setState(wa_id, 'idle', 'awaiting_menu_pick', { lang });
}

module.exports = { showMenu };
