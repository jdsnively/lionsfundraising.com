/**
 * lions-nav.js
 *
 * The site header for lionsfundraising.com.
 *
 * This is the counterpart to /includes/header.php on lionssports.club and is
 * the ONE place navigation is defined on this property, exactly as $nav_items
 * is over there. Adding an item is a row in NAV_ITEMS below; every page picks
 * it up.
 *
 * WHY THIS IS JAVASCRIPT AND NOT A PHP INCLUDE
 *
 * It should be a PHP include, and the brand alignment audit sets that out as
 * the target. It is not yet, because moving the application pages from .html
 * to .php means deleting each old .html on the server or the stale copy
 * shadows the new one, and that is the single most common deploy bug on this
 * stack. Until that migration is scheduled, a rendered header keeps one
 * definition instead of a copy per page, which is the property that actually
 * matters. When the include lands, delete this file and the shell element on
 * each page.
 *
 * WHY THE MARKETING NAV IS NO LONGER CARRIED HERE
 *
 * It used to be, and the reasoning was that a volunteer moving from
 * lionssports.club to this application should not feel that they have left, so
 * NAV_ITEMS mirrored $nav_items in /includes/header.php row for row.
 *
 * Jason ended that on 2026-09-03. This property is the application, not a
 * second front door to the marketing site, and a volunteer who is here came
 * here to do something. The only outbound row left is LSC Home. Everything
 * else in the bar belongs to this property.
 *
 * DO NOT RESTORE THE MARKETING ROWS. The absence is the decision. If the two
 * navigations ever need to agree again, that is a new ruling and it needs a
 * new comment here saying so.
 *
 * THE SINGLE CTA SLOT
 *
 * Exactly one gold pill, or the hierarchy collapses. That slot used to be
 * Shop, pointing at the team store. It is now Admin, which is not a row in
 * NAV_ITEMS at all: it is injected by setAuth, gated per route by canAccess,
 * and it does not exist for a signed out visitor or for a volunteer who holds
 * none of the three systems. Identity controls are likewise never rows in
 * NAV_ITEMS. They are rendered into their own two slots, one in the header row
 * and one at the foot of the drawer, and the stylesheet shows exactly one of
 * them at any width. See setAuth.
 *
 * Load with defer, before the page module:
 *   <script src="/js/lions-log.js"></script>
 *   <script src="/js/lions-nav.js" defer></script>
 */

(function () {
    'use strict';

    var MAIN = 'https://lionssports.club';

    /**
     * The navigation for this property. Order is the visual order on desktop,
     * left to right, and in the drawer, top to bottom.
     *
     * FLATTENED 2026-09-07. These five rows sat inside a single Fundraising
     * dropdown until today. Jason's ruling: this property is the application,
     * so its own routes belong in the bar rather than one click down.
     *
     * THIS LIST NO LONGER MIRRORS $nav_items IN /includes/header.php, AND THAT
     * IS DELIBERATE. An earlier version of this comment said the mirror
     * existed so the two could not disagree. Jason ruled on 2026-09-05 that
     * they should disagree: lionssports.club is the front door, this is the
     * application behind it, and a volunteer who is here came here to do
     * something. ADR-006 governs the exception and R-20 applies. Do not
     * restore the mirror, and do not restore the marketing rows: the absence
     * is the decision.
     *
     * The ONE row that must still be kept in step across properties is
     * 'signup'. It points at the Evite in three places: here, index.html:671
     * on this property, and the same key in /includes/header.php over there.
     *
     * Rows carrying `children` render as a dropdown. Rows carrying `external`
     * open in a new tab. No row carries `cta`: that slot is Admin, injected by
     * setAuth, and a second pill would collapse the hierarchy.
     *
     * Every row that points at this property uses a root relative path so it
     * stays correct on staging or a renamed host. LSC Home is absolute because
     * it leaves, and it is the only row that does.
     *
     * WIDTH BUDGET, measured in Chromium on 2026-09-07 against the live
     * stylesheets and the real computed type, by rendering this file's own
     * output and reading the intrinsic width of .header-inner. These are
     * rendered numbers, not a nav width plus a constant:
     *
     *   LSC Home + Fundraising dropdown, as shipped        878px
     *   these five rows, Lucas Oil / Permit               1158px
     *   these five, Lucas Oil / Alcohol Permit            1230px
     *   these five, Lucas Oil Guide / Permit              1206px
     *   these five, both labels left at full length       1278px
     *   six rows with Fundraising Home, full labels       1452px
     *
     * The header rail is 1340px above 1300px, so EVERY five row set fits with
     * no compression at every width from 1300 up, and only the six row set
     * squeezes, by 112px. "Fundraising Home" is dropped because the wordmark
     * already links to /. Before lengthening a label here, render it and read
     * the intrinsic width of .header-inner. Do not add a sixth row.
     */
    var NAV_ITEMS = [
        { key: 'home',        label: 'LSC Home',     href: MAIN + '/' },
        { key: 'register',    label: 'Register',     href: '/register' },
        // The Evite. Kept in step with two other copies: index.html:671 on this
        // property, and key 'signup' in /includes/header.php on lionssports.club.
        // The in-house signup at /signup was tabled on 2026-09-03 and denied at
        // the root .htaccess on 2026-09-07.
        { key: 'signup',      label: 'Event Signup', href: 'https://evite.me/UDcPG9FasP', external: true },
        { key: 'los',         label: 'Lucas Oil',    href: '/LOS' },
        { key: 'sodexo-atc',  label: 'Permit',       href: '/sodexo-atc' }
    ];

    /**
     * Administrator routes.
     *
     * Deliberately NOT rows in NAV_ITEMS. Not because of a mirror, which no
     * longer exists as of 2026-09-05, but because these three are gated per
     * route by canAccess and NAV_ITEMS is rendered before auth resolves. A row
     * here would be in the bar for a signed out visitor.
     *
     * They are rendered by setAuth, once auth has resolved, as a standalone
     * top level dropdown in the single CTA slot. They were inside the
     * Fundraising dropdown until 2026-09-03, because the header rail then
     * carried seven marketing items and needed 1285px; an eighth pushed the bar
     * into the identity controls at exactly the widths a laptop uses. Those
     * marketing rows are gone, and NAV_ITEMS was flattened to five own-property
     * rows on 2026-09-07 needing 1158px inside a 1340px rail, so the room
     * exists and Admin is where an administrator will look for it.
     *
     * `system` names the entry in SYSTEM_ACCESS that governs the route. This
     * file does not carry a copy of those allow lists. The page hands setAuth a
     * canAccess function and this asks it, so the menu a person sees and the
     * access they hold cannot drift apart. A page that supplies no canAccess
     * gets no administrator rows at all, which is the safe answer.
     */
    var ADMIN_ITEMS = [
        { key: 'dashboard', label: 'Dashboard', href: '/dashboard', system: 'dashboard' },
        { key: 'payouts',   label: 'Payouts',   href: '/payouts',   system: 'payouts' },
        { key: 'treasurer', label: 'Treasurer', href: '/treasurer', system: 'treasurer' }
    ];

    // Marks every element setAuth injects, so a second call replaces the first
    // rather than adding a second copy. setAuth runs once per page today, and
    // an administrator page that resolves auth twice is exactly the shape that
    // would otherwise grow a duplicate menu.
    var ADMIN_MARK = 'data-lions-admin-item';

    var CARET =
        '<svg class="nav-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + ' stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<polyline points="6 9 12 15 18 9"></polyline></svg>';

    var BURGER =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"'
      + ' stroke-linecap="round" aria-hidden="true">'
      + '<line x1="3" y1="6" x2="21" y2="6"></line>'
      + '<line x1="3" y1="12" x2="21" y2="12"></line>'
      + '<line x1="3" y1="18" x2="21" y2="18"></line></svg>';

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function currentAttr(key, active) {
        return key === active ? ' aria-current="page"' : '';
    }

    function externalAttr(item) {
        if (!item.external) { return ''; }
        return ' target="_blank" rel="noopener" aria-label="'
             + esc(item.label + ', opens in a new tab') + '"';
    }

    /** True when this row or any of its children is the active page. */
    function isActiveTrail(item, active) {
        if (item.key === active) { return true; }
        return (item.children || []).some(function (c) { return c.key === active; });
    }

    // -----------------------------------------------------------------------
    // Markup
    // -----------------------------------------------------------------------

    function desktopNav(active) {
        var out = '<nav class="primary-nav" aria-label="Primary"><ul>';

        NAV_ITEMS.forEach(function (item) {
            if (item.children) {
                var head = item.href
                    ? '<a href="' + esc(item.href) + '" class="nav-dropdown-toggle'
                      + (isActiveTrail(item, active) ? ' is-active-trail' : '') + '"'
                      + ' aria-haspopup="true" aria-expanded="false" aria-controls="dd-'
                      + esc(item.key) + '">' + esc(item.label) + CARET + '</a>'
                    : '<button type="button" class="nav-dropdown-toggle'
                      + (isActiveTrail(item, active) ? ' is-active-trail' : '') + '"'
                      + ' aria-haspopup="true" aria-expanded="false" aria-controls="dd-'
                      + esc(item.key) + '">' + esc(item.label) + CARET + '</button>';
                out += '<li class="has-dropdown">' + head
                     + '<ul class="dropdown-menu" id="dd-' + esc(item.key) + '">'
                     + item.children.map(function (c) {
                         return '<li><a href="' + esc(c.href) + '" class="dropdown-link"'
                              + currentAttr(c.key, active) + externalAttr(c) + '>'
                              + esc(c.label) + '</a></li>';
                       }).join('')
                     + '</ul></li>';
            } else {
                out += '<li><a href="' + esc(item.href) + '" class="nav-link'
                     + (item.cta ? ' nav-link--cta' : '') + '"'
                     + currentAttr(item.key, active) + externalAttr(item) + '>'
                     + esc(item.label) + '</a></li>';
            }
        });

        return out + '</ul></nav>';
    }

    function mobileNav(active) {
        var out = '<nav id="mobile-nav" class="mobile-nav" aria-label="Mobile primary" hidden><ul>';

        NAV_ITEMS.forEach(function (item) {
            if (item.children) {
                out += '<li><button type="button" class="mobile-dropdown-toggle'
                     + (isActiveTrail(item, active) ? ' is-active-trail' : '') + '"'
                     + ' aria-expanded="false" aria-controls="m-' + esc(item.key) + '">'
                     + esc(item.label) + CARET + '</button>'
                     + '<div class="mobile-submenu" id="m-' + esc(item.key) + '">'
                     + (item.href
                         ? '<a href="' + esc(item.href) + '"' + currentAttr(item.key, active)
                           + '>' + esc(item.label) + '</a>'
                         : '')
                     + item.children.map(function (c) {
                         return '<a href="' + esc(c.href) + '"' + currentAttr(c.key, active)
                              + externalAttr(c) + '>' + esc(c.label) + '</a>';
                       }).join('')
                     + '</div></li>';
            } else {
                out += '<li><a href="' + esc(item.href) + '" class="mobile-nav-link'
                     + (item.cta ? ' mobile-nav-link--cta' : '') + '"'
                     + currentAttr(item.key, active) + externalAttr(item) + '>'
                     + esc(item.label) + '</a></li>';
            }
        });

        // The identity slot sits at the foot of the drawer, after the nav items,
        // and is filled by setAuth. It is emitted empty rather than omitted so
        // that setAuth has somewhere to write on a page that resolves auth after
        // the header has already rendered, which is every page on this property.
        return out + '</ul>'
             + '<div class="mobile-auth" id="mobile-auth-slot"></div>'
             + '</nav>';
    }

    /**
     * Renders the header into the shell element.
     *
     * @param {string} active nav key for the current page, or '' on a page
     *        that is not in the navigation.
     */
    function render(active) {
        var host = document.getElementById('site-header');
        if (!host) { return; }

        host.className = 'site-header';
        host.innerHTML =
            '<div class="header-inner">'
          + '<button type="button" class="nav-toggle" aria-label="Open menu"'
          + ' aria-expanded="false" aria-controls="mobile-nav">' + BURGER + '</button>'
          + '<a href="/" class="logo-link" aria-label="Lions Sports Club Home">'
          + '<div class="logo"></div></a>'
          + '<div class="header-name"><a href="/">Lions Sports Club</a></div>'
          + desktopNav(active)
          + '<div class="auth-slot" id="auth-slot"></div>'
          + '</div>'
          + mobileNav(active);

        wire();
    }

    /** Closes every open dropdown in both the desktop bar and the drawer. */
    function closeAllDropdowns() {
        document.querySelectorAll('.nav-dropdown-toggle[aria-expanded="true"]')
            .forEach(function (b) {
                b.setAttribute('aria-expanded', 'false');
                var menu = document.getElementById(b.getAttribute('aria-controls'));
                if (menu) { menu.classList.remove('is-open'); }
            });
    }

    /* Wiring is per button rather than one sweep at boot, because the Admin
       dropdown is injected by setAuth after auth resolves, long after wire()
       has run. A toggle added later and never wired still opens on hover on a
       desktop, because that part is pure CSS, and does nothing at all on a
       phone. That is trap T17 in a new place: the second call site is easy to
       miss precisely because the first one works. The guard attribute makes a
       second call on the same button a no-op, since setAuth can run more than
       once on a page that resolves auth twice. */
    function wireDropdown(button) {
        if (!button || button.getAttribute('data-nav-wired') === 'true') { return; }
        button.setAttribute('data-nav-wired', 'true');
        button.addEventListener('click', function (e) {
            e.stopPropagation();
            var menu = document.getElementById(button.getAttribute('aria-controls'));
            var open = button.getAttribute('aria-expanded') !== 'true';
            closeAllDropdowns();
            if (open && menu) {
                button.setAttribute('aria-expanded', 'true');
                menu.classList.add('is-open');
            }
        });
    }

    function wireMobileDropdown(button) {
        if (!button || button.getAttribute('data-nav-wired') === 'true') { return; }
        button.setAttribute('data-nav-wired', 'true');
        button.addEventListener('click', function () {
            var panel = document.getElementById(button.getAttribute('aria-controls'));
            var open = button.getAttribute('aria-expanded') !== 'true';
            button.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (panel) { panel.classList.toggle('is-open', open); }
        });
    }

    /**
     * Appends the administrator routes to the bar as a standalone Admin
     * dropdown in the CTA slot, and to the foot of the drawer's list.
     *
     * They were appended to the Fundraising dropdown until 2026-09-03. This
     * comment said so until 2026-09-07, while the code below had already
     * stopped doing it.
     *
     * Runs on both renderings, the desktop list and the drawer panel, because
     * the stylesheet shows one or the other by width and a volunteer on a
     * laptop and the same person on a phone must not be offered different
     * routes.
     *
     * Every previously injected element is removed first. Nothing is added when
     * the caller is signed out, supplies no canAccess, or holds none of the
     * three systems, so a volunteer's menu is unchanged and a treasurer sees
     * Payouts and Treasurer without a Dashboard link they cannot open.
     */
    function renderAdminItems(state) {
        document.querySelectorAll('[' + ADMIN_MARK + ']')
            .forEach(function (el) { el.parentNode.removeChild(el); });

        var signedIn = !!(state && state.signedIn);
        var canAccess = state && typeof state.canAccess === 'function' ? state.canAccess : null;
        if (!signedIn || !canAccess) { return; }

        var allowed = ADMIN_ITEMS.filter(function (item) {
            try {
                return canAccess(item.system) === true;
            } catch (error) {
                // A caller whose canAccess throws is treated as granting
                // nothing. Showing a route on the strength of an exception is
                // the one outcome worth ruling out.
                return false;
            }
        });
        if (!allowed.length) { return; }

        var active = (state && state.active) || '';

        var onAdminPage = allowed.some(function (i) { return i.key === active; });

        var desktopList = document.querySelector('.primary-nav > ul');
        if (desktopList) {
            var li = document.createElement('li');
            li.setAttribute(ADMIN_MARK, '');
            li.className = 'has-dropdown';
            li.innerHTML =
                '<button type="button" class="nav-dropdown-toggle nav-dropdown-toggle--cta'
              + (onAdminPage ? ' is-active-trail' : '') + '"'
              + ' aria-haspopup="true" aria-expanded="false" aria-controls="dd-admin">'
              + 'Admin' + CARET + '</button>'
              + '<ul class="dropdown-menu" id="dd-admin">'
              + allowed.map(function (item) {
                    return '<li><a href="' + esc(item.href) + '" class="dropdown-link"'
                         + currentAttr(item.key, active) + '>' + esc(item.label) + '</a></li>';
                }).join('')
              + '</ul>';
            desktopList.appendChild(li);
            wireDropdown(li.querySelector('.nav-dropdown-toggle'));
        }

        var drawerList = document.querySelector('#mobile-nav > ul');
        if (drawerList) {
            var mli = document.createElement('li');
            mli.setAttribute(ADMIN_MARK, '');
            mli.innerHTML =
                '<button type="button" class="mobile-dropdown-toggle mobile-dropdown-toggle--cta'
              + (onAdminPage ? ' is-active-trail' : '') + '"'
              + ' aria-expanded="false" aria-controls="m-admin">'
              + 'Admin' + CARET + '</button>'
              + '<div class="mobile-submenu" id="m-admin">'
              + allowed.map(function (item) {
                    return '<a href="' + esc(item.href) + '"'
                         + currentAttr(item.key, active) + '>' + esc(item.label) + '</a>';
                }).join('')
              + '</div>';
            drawerList.appendChild(mli);
            wireMobileDropdown(mli.querySelector('.mobile-dropdown-toggle'));
        }
    }

    /**
     * Fills both identity areas. Called by the page once auth has resolved, so
     * that a signed-out visitor never sees an account link they cannot use.
     *
     * The controls are written twice, into the header row and into the drawer,
     * and the stylesheet displays exactly one pair: the header at 1300px and
     * above, the drawer below it. This comment said 1280px until 2026-09-07;
     * the stylesheet has used 1300 since the deviation was measured on
     * 2026-08-02. Rendering both and choosing in CSS avoids listening for
     * resize and avoids re-rendering the header when a phone is rotated,
     * either of which would drop the sign-out handler at the moment it is
     * needed. The duplicate is two controls in the DOM, not two on the screen.
     *
     * Neither sign-out control carries an id. There were two of them, and two
     * elements answering to getElementById('sign-out') is a defect waiting for
     * whoever adds the third caller.
     */
    function setAuth(state) {
        var slot = document.getElementById('auth-slot');
        var drawerSlot = document.getElementById('mobile-auth-slot');
        var signedIn = !!(state && state.signedIn);
        var current = signedIn && state.active === 'account' ? ' aria-current="page"' : '';

        renderAdminItems(state);

        if (slot) {
            slot.innerHTML = signedIn
                ? '<a href="/account" class="auth-link"' + current + '>My Account</a>'
                + '<button type="button" class="auth-signout">Sign out</button>'
                : '';
        }

        if (drawerSlot) {
            drawerSlot.innerHTML = signedIn
                ? '<a href="/account" class="mobile-nav-link mobile-auth-link"' + current
                + '>My Account</a>'
                + '<button type="button" class="mobile-nav-link mobile-auth-signout">'
                + 'Sign out</button>'
                : '';
        }

        if (signedIn && typeof state.onSignOut === 'function') {
            document.querySelectorAll('.auth-signout, .mobile-auth-signout')
                .forEach(function (button) {
                    button.addEventListener('click', state.onSignOut);
                });
        }
    }

    // -----------------------------------------------------------------------
    // Behaviour
    //
    // Ported from /js/site.js. Dropdowns open on hover for a mouse, which is
    // pure CSS, and on click or focus for touch and keyboard, which is here.
    // -----------------------------------------------------------------------

    function wire() {
        var toggle = document.querySelector('.nav-toggle');
        var drawer = document.getElementById('mobile-nav');

        if (toggle && drawer) {
            toggle.addEventListener('click', function (e) {
                e.stopPropagation();
                var open = toggle.getAttribute('aria-expanded') !== 'true';
                if (open) {
                    drawer.removeAttribute('hidden');
                    // requestAnimationFrame rather than a forced reflow, so the
                    // max-height transition has a start value without thrashing
                    // layout. Matches site.js.
                    requestAnimationFrame(function () {
                        drawer.classList.add('is-open');
                        toggle.setAttribute('aria-expanded', 'true');
                    });
                } else {
                    drawer.classList.remove('is-open');
                    drawer.setAttribute('hidden', '');
                    toggle.setAttribute('aria-expanded', 'false');
                }
            });
        }

        document.querySelectorAll('.nav-dropdown-toggle').forEach(wireDropdown);
        document.querySelectorAll('.mobile-dropdown-toggle').forEach(wireMobileDropdown);

        document.addEventListener('click', closeAllDropdowns);

        // Escape closes whatever is open and returns focus to its control,
        // which the accessibility baseline requires.
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') { return; }

            var openToggle = document.querySelector('.nav-dropdown-toggle[aria-expanded="true"]');
            if (openToggle) {
                closeAllDropdowns();
                openToggle.focus();
                return;
            }

            if (toggle && drawer && toggle.getAttribute('aria-expanded') === 'true') {
                drawer.classList.remove('is-open');
                drawer.setAttribute('hidden', '');
                toggle.setAttribute('aria-expanded', 'false');
                toggle.focus();
            }
        });
    }

    window.LIONS_NAV = {
        render: render,
        setAuth: setAuth,
        items: NAV_ITEMS,
        adminItems: ADMIN_ITEMS
    };

    // Renders as soon as the shell exists. data-nav on the shell names the
    // active key, so a page declares its own position rather than this file
    // matching on location, which is how the previous header got active state
    // wrong on sub-pages.
    function boot() {
        var host = document.getElementById('site-header');
        if (host) { render(host.getAttribute('data-nav') || ''); }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}());
