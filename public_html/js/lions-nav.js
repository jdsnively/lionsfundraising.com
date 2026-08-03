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
 * WHY THE MARKETING NAV IS CARRIED HERE
 *
 * A volunteer moving from lionssports.club to this application should not feel
 * that they have left. The marketing items point back at absolute URLs; the
 * Fundraising dropdown holds Register and Event Signup, which live here. The
 * same dropdown exists on the marketing site pointing the other way, so the
 * two properties read as one site with one navigation.
 *
 * The Shop CTA is the single gold pill, matching the marketing site. There is
 * deliberately no second CTA: one at a time, or the hierarchy collapses.
 * Identity controls are never rows in NAV_ITEMS, so this list stays a mirror of
 * $nav_items rather than a variant of it. They are rendered into their own two
 * slots, one in the header row and one at the foot of the drawer, and the
 * stylesheet shows exactly one of them at any width. See setAuth.
 *
 * Load with defer, before the page module:
 *   <script src="/js/lions-log.js"></script>
 *   <script src="/js/lions-nav.js" defer></script>
 */

(function () {
    'use strict';

    var MAIN = 'https://lionssports.club';

    /**
     * Mirrors $nav_items in /includes/header.php. Order is the visual order on
     * desktop, left to right, and in the drawer, top to bottom.
     *
     * Rows carrying `children` render as a dropdown. Rows carrying `external`
     * open in a new tab. Exactly one row may carry `cta`.
     *
     * The two rows under Fundraising that point at this property use root
     * relative paths so they stay correct on staging or a renamed host. The
     * marketing rows are absolute because they leave.
     */
    var NAV_ITEMS = [
        { key: 'home',        label: 'Home',        href: MAIN + '/' },
        { key: 'about',       label: 'About', children: [
            { key: 'about',       label: 'Our Mission', href: MAIN + '/about' },
            { key: 'who-we-are',  label: 'Who We Are',  href: MAIN + '/who-we-are' }
        ]},
        { key: 'join',        label: 'Join',        href: MAIN + '/join' },
        // A row carrying BOTH href and children renders as a link on desktop, so
        // hovering opens the menu and clicking goes to the page. On a phone it
        // stays a button, because a control that navigates and opens a panel at
        // the same time cannot be used with a thumb, and its destination is
        // injected as the first item of the drawer submenu instead.
        { key: 'fundraising', label: 'Fundraising', href: MAIN + '/fundraising', children: [
        // These five are the volunteer's actual destinations. Porting the
        // marketing navigation onto the application removed every route the old
        // header carried, which left /LOS and /sodexo-atc as dead ends with no
        // way out but the back button. They live here rather than in a second
        // application-only menu so that the chrome stays one definition on both
        // properties, which is what ADR-006 requires. A visitor on the marketing
        // site can reach the Lucas Oil guide too, which is no loss.
            { key: 'home-erp',    label: 'Fundraising Home', href: '/' },
            { key: 'signup',      label: 'Event Signup',     href: '/signup' },
            { key: 'register',    label: 'Register',         href: '/register' },
            { key: 'los',         label: 'Lucas Oil Guide',  href: '/LOS' },
            { key: 'sodexo-atc',  label: 'Alcohol Permit',   href: '/sodexo-atc' }
        ]},
        { key: 'resources',   label: 'Resources', children: [
            { key: 'eventlink',     label: 'EventLink Guide',     href: MAIN + '/eventlink' },
            { key: 'physical-form', label: 'IHSAA Physical Form', href: MAIN + '/physical-form' }
        ]},
        { key: 'contact',     label: 'Contact',     href: MAIN + '/contact' },
        { key: 'shop',        label: 'Shop',
          href: 'https://teamstore.frecklesgraphics.com/shop/lionssportsclub/',
          external: true, cta: true }
    ];

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

    /**
     * Fills both identity areas. Called by the page once auth has resolved, so
     * that a signed-out visitor never sees an account link they cannot use.
     *
     * The controls are written twice, into the header row and into the drawer,
     * and the stylesheet displays exactly one pair: the header above 1280px,
     * the drawer below it. Rendering both and choosing in CSS avoids listening
     * for resize and avoids re-rendering the header when a phone is rotated,
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

        function closeAllDropdowns() {
            document.querySelectorAll('.nav-dropdown-toggle[aria-expanded="true"]')
                .forEach(function (b) {
                    b.setAttribute('aria-expanded', 'false');
                    var menu = document.getElementById(b.getAttribute('aria-controls'));
                    if (menu) { menu.classList.remove('is-open'); }
                });
        }

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

        document.querySelectorAll('.nav-dropdown-toggle').forEach(function (button) {
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
        });

        document.querySelectorAll('.mobile-dropdown-toggle').forEach(function (button) {
            button.addEventListener('click', function () {
                var panel = document.getElementById(button.getAttribute('aria-controls'));
                var open = button.getAttribute('aria-expanded') !== 'true';
                button.setAttribute('aria-expanded', open ? 'true' : 'false');
                if (panel) { panel.classList.toggle('is-open', open); }
            });
        });

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

    window.LIONS_NAV = { render: render, setAuth: setAuth, items: NAV_ITEMS };

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
