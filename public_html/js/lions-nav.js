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
 * here to do something. As of 2026-09-08 no row in the bar goes back to the
 * marketing site at all: the wordmark carries that trip, which is where a
 * visitor already expects to find it. Every row in the bar belongs to this
 * property, and the one row that leaves is the Evite.
 *
 * DO NOT RESTORE THE MARKETING ROWS. The absence is the decision. If the two
 * navigations ever need to agree again, that is a new ruling and it needs a
 * new comment here saying so.
 *
 * THE SINGLE CTA SLOT
 *
 * Exactly one gold pill, or the hierarchy collapses. That slot used to be
 * Shop, pointing at the team store. It is now Admin, which is not a row in
 * NAV_ITEMS at all: it is emitted by adminItem at header build time and
 * replaced by setAuth once auth resolves.
 *
 * The pill has three states, ruled by Jason on 2026-09-08:
 *
 *   signed out                   a gold "Sign In" link to /login
 *   signed in, holds a system    the gold "Admin" dropdown, gated per route
 *                                by canAccess, exactly as before
 *   signed in, holds none        no pill
 *
 * THE LABEL CHANGES WITH THE STATE, AND THAT IS THE POINT. The pill read
 * "Admin" in every state for most of 2026-09-08, which put the only sign in
 * door on the property behind a word aimed at the three people who are not
 * the audience. Event signup is the Evite and needs no account, but /account
 * is where a volunteer reads their running earnings total and manages their
 * alcohol permit, and index.html promises exactly that: "You can follow the
 * running total from your account at any time." A parent looking for that
 * total does not click Admin. Signed in, the same slot says Admin, because by
 * then the person holding it is an administrator.
 *
 * The third state is not an oversight and not a shortcut. /login redirects an
 * already authenticated visitor to sessionStorage.lionsAuthRedirect or, when
 * that is empty, to /dashboard. Pointing a signed in volunteer at /login
 * therefore lands them on the one page most certain to refuse them. They
 * already have My Account and Sign out in the identity slot, so the header is
 * not bare for them.
 *
 * Identity controls are likewise never rows in NAV_ITEMS. They are rendered
 * into their own two slots, one in the header row and one at the foot of the
 * drawer, and the stylesheet shows exactly one of them at any width. See
 * setAuth.
 *
 * Load with defer, before the page module:
 *   <script src="/js/lions-log.js"></script>
 *   <script src="/js/lions-nav.js" defer></script>
 */

(function () {
    'use strict';

    var MAIN = 'https://lionssports.club';

    // Where the signed out Admin pill goes. /login carries the shared header
    // and renders its own sign in card; /auth/signin.html is the bare magic
    // link card and is deliberately noindex, so it is not the front door.
    var SIGN_IN = '/login';

    // What the CTA pill says before anyone has signed in. Signed in with
    // access it says "Admin" instead, written into renderAdminItems.
    var SIGN_IN_LABEL = 'Sign In';

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
     * Every row uses a root relative path so it stays correct on staging or a
     * renamed host. The one absolute href is the Evite, which is a third party
     * URL and cannot be anything else. The trip back to lionssports.club left
     * this list on 2026-09-08 and is now the wordmark. See render.
     *
     * WIDTH BUDGET, re-measured in Chromium on 2026-09-08 against the live
     * stylesheets and the real computed type, by rendering this file's own
     * output and reading the intrinsic width of .header-inner. These are
     * rendered numbers, not a nav width plus a constant.
     *
     * EVERY NUMBER IN THE 2026-09-07 TABLE WAS THE SIGNED IN CASE and the
     * table did not say so, which cost a re-measurement to establish. The
     * identity controls are 181px of it and the Admin pill another 138px, so
     * a signed out reading of the same bar is about 320px narrower and is not
     * the number to budget against. The worst case is what is recorded here:
     * five rows, the Admin pill, My Account and Sign out.
     *
     *   the 2026-09-07 shape, LSC Home / Permit           1158px
     *   SHIPPED 2026-09-08, Home / Alcohol Permit         1199px
     *     the same bar signed out, pill in its link form  1000px
     *     the same bar, signed in volunteer, no pill      1061px
     *   six rows including Fundraising Home, from 09-07   1452px
     *
     * The worst case is 1199px inside a 1340px rail. That is 141px of slack,
     * and there is no horizontal overflow at 1300, 1366, 1440, 1536, 1600 or
     * 1920. Measured in all four auth states, because the pill and the
     * identity slot appear in different combinations and only one of the four
     * is the widest.
     *
     * The header rail is 1340px above 1300px. Before lengthening a label here,
     * render it and read the intrinsic width of .header-inner, signed in.
     * Do not add a sixth row.
     */
    var NAV_ITEMS = [
        // Home is this property's landing page, not the marketing site. It was
        // 'LSC Home' pointing at lionssports.club until 2026-09-08, when the
        // two destinations traded places: the wordmark goes back, the row
        // stays here. A visitor reaches for the logo to leave and for Home to
        // get to the top of the site they are on, and until 09-08 this bar
        // answered both of those with the same page.
        { key: 'home',        label: 'Home',           href: '/' },
        { key: 'register',    label: 'Register',       href: '/register' },
        // The Evite. Kept in step with two other copies: index.html:671 on this
        // property, and key 'signup' in /includes/header.php on lionssports.club.
        // The in-house signup at /signup was tabled on 2026-09-03 and denied at
        // the root .htaccess on 2026-09-07.
        { key: 'signup',      label: 'Event Signup',   href: 'https://evite.me/UDcPG9FasP', external: true },
        { key: 'los',         label: 'Lucas Oil',      href: '/LOS' },
        // 'Permit' until 2026-09-08. With the longer label the worst case bar
        // renders at 1199px inside a 1340px rail, so it costs nothing that can
        // be measured, and 'Permit' on its own does not say what kind.
        { key: 'sodexo-atc',  label: 'Alcohol Permit', href: '/sodexo-atc' }
    ];

    /**
     * Administrator routes.
     *
     * Deliberately NOT rows in NAV_ITEMS. Not because of a mirror, which no
     * longer exists as of 2026-09-05, but because these three are gated per
     * route by canAccess and NAV_ITEMS is rendered before auth resolves. A row
     * here would put an ungated destination in the bar for a signed out
     * visitor.
     *
     * The Admin PILL is in the bar before auth resolves, as of 2026-09-08, but
     * in its link form, which carries none of these three destinations. The
     * gate is on the routes, and the routes are still only ever written by
     * renderAdminItems after canAccess has answered.
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

    /**
     * The signed out form of the CTA pill: a gold link to the sign in page.
     *
     * Emitted here, at header build time, rather than by setAuth, because
     * SETAUTH IS NEVER CALLED FOR A SIGNED OUT VISITOR. lions-header-identity.js
     * returns early when storedSession() is empty, and that is every anonymous
     * visit to the landing page, /login, /register, /LOS and /sodexo-atc. A
     * pill that only setAuth could draw would never once appear for the people
     * it exists for. This is the same shape as the 2026-08-05 defect recorded
     * at the top of lions-header-identity.js: the header was not at fault,
     * nothing asked it.
     *
     * It carries ADMIN_MARK, so renderAdminItems removes it in the same sweep
     * that clears a previous dropdown. That is what keeps the two forms of the
     * pill from ever both being in the bar.
     *
     * The label is SIGN_IN_LABEL, not "Admin". See the CTA slot note at the
     * top of this file for why the two forms are named differently.
     */
    function adminItem(mobile) {
        return mobile
            ? '<li ' + ADMIN_MARK + '><a href="' + SIGN_IN + '"'
              + ' class="mobile-nav-link mobile-nav-link--cta">'
              + SIGN_IN_LABEL + '</a></li>'
            : '<li ' + ADMIN_MARK + '><a href="' + SIGN_IN + '"'
              + ' class="nav-link nav-link--cta">' + SIGN_IN_LABEL + '</a></li>';
    }

    /**
     * Puts the signed out pill back after renderAdminItems has cleared it.
     * Separate from adminItem because renderAdminItems writes into a live
     * document and desktopNav builds a string.
     */
    function restoreAdminItem() {
        var desktopList = document.querySelector('.primary-nav > ul');
        if (desktopList) { desktopList.insertAdjacentHTML('beforeend', adminItem(false)); }

        var drawerList = document.querySelector('#mobile-nav > ul');
        if (drawerList) { drawerList.insertAdjacentHTML('beforeend', adminItem(true)); }
    }

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

        return out + adminItem(false) + '</ul></nav>';
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
        return out + adminItem(true) + '</ul>'
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
          // The mark and the wordmark go BACK to lionssports.club, ruled
          // 2026-09-08. They pointed at '/' on this property until then, while
          // the aria-label said "Lions Sports Club Home" and the bar carried a
          // separate LSC Home row: three controls, two destinations, and the
          // accessible name describing the one it did not go to. The lockup is
          // the way back to the club and the Home row is the way to the top of
          // this application. Same tab on purpose: this is a return, not a
          // side trip, so it does not take rel=noopener or a new window.
          + '<a href="' + MAIN + '/" class="logo-link" aria-label="Lions Sports Club Home">'
          + '<div class="logo"></div></a>'
          + '<div class="header-name"><a href="' + MAIN + '/">Lions Sports Club</a></div>'
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
     * Every previously injected element is removed first, which includes the
     * signed out pill adminItem put in the bar at build time. What goes back
     * depends on the state, and the three cases are set out above NAV_ITEMS:
     * signed out gets the link form back, an administrator gets the dropdown
     * filtered by canAccess, and a signed in volunteer holding none of the
     * three gets nothing rather than a link to a page that would refuse them.
     * A treasurer sees Payouts and Treasurer without a Dashboard link they
     * cannot open.
     */
    function renderAdminItems(state) {
        document.querySelectorAll('[' + ADMIN_MARK + ']')
            .forEach(function (el) { el.parentNode.removeChild(el); });

        var signedIn = !!(state && state.signedIn);
        var canAccess = state && typeof state.canAccess === 'function' ? state.canAccess : null;

        // Signed out, or a caller that supplied no canAccess. The pill goes
        // back in its link form. Returning here instead would leave the bar
        // with no CTA at all, because the removal above has already run.
        if (!signedIn || !canAccess) { restoreAdminItem(); return; }

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
        // Signed in and holding none of the three. Nothing is added, and the
        // link form is deliberately NOT restored: /login redirects an already
        // authenticated visitor to sessionStorage.lionsAuthRedirect or, empty,
        // to /dashboard, so the pill would hand this person the one page that
        // is certain to turn them away. My Account and Sign out are already in
        // the identity slot.
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
