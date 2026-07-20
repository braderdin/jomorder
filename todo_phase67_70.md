# Phase 67-70 Todo

## Phase 67 - Link Fix + Routing Gap
- [ ] Fix vercel.json wrong link (/bot + /telegram)
- [ ] Fix index.html 6x @JomOrderBot wrong link
- [ ] router_callbacks: merchant_zon/upload_qr -> handleTetapanCallback
- [ ] navigation.ts: nav:admin submenu back:admin
- [ ] platform_admin.ts: support back:admin
- [ ] Deploy + smoke 113/113 + git commit/push

## Phase 68 - HELPER Round-Robin Hardening
- [ ] Round-robin baca senarai dinamik dari env, skip tiada
- [ ] bin helper ping assert 15 OK
- [ ] Deploy + commit/push

## Phase 69 - GUI Polish & BACK-chain
- [ ] merchant_menu_gui: nav:merchant parent + back:menu
- [ ] customer_gui: empty-state CTA
- [ ] founder_view_gui: back:main + escape
- [ ] index.html + script.js: ?start=founder deep-link
- [ ] Deploy + commit/push

## Phase 70 - Regression + CI + Final Deploy
- [ ] package.json: vitest + npm test gate
- [ ] callback_test.ts matrix run
- [ ] e2e-regression.sh gabung tsc+smoke+test
- [ ] Deploy akhir + force-webhook-register + commit/push + ping 15 HELPER