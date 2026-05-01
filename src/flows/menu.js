/**
 * src/flows/menu.js — Top-level menu list message.
 *
 * The 5 rows match the 5 customer flows: book / status / catalog / info / handoff.
 * The router treats menu as the "idle" landing — any of these row IDs sets the
 * flow accordingly and dispatches to the matching flow handler with a synthetic
 * "entry" event.
 */

'use strict';

const { sendInteractiveList } = require('../actions');
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
    t('welcome.title', lang),
    t('welcome.body', lang),
    t('menu.button', lang),
    sections,
  );

  // Mark the customer as "at menu" — next click will enter a flow.
  await setState(wa_id, 'idle', 'awaiting_menu_pick', { lang });
}

module.exports = { showMenu };
