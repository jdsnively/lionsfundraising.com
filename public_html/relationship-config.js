// relationship-config.js
// Single source of truth for participant relationship values.
//
// CONFIG_VERSION is incremented whenever a canonical value is renamed. Renamed
// values are recorded in LEGACY_ALIASES so that documents written under an
// earlier version continue to resolve correctly. Consumers should pass any
// stored value through normalize() before comparing it against a canonical
// value or using it as a lookup key.
//
// Records in Lions-Fundraising-Users are not rewritten automatically. A
// rename therefore requires either a backfill or continued reliance on the
// alias map. Both are supported; the alias map is the safety net.

const RELATIONSHIP_CONFIG = {

    CONFIG_VERSION: 3,

    groups: {
        'Lions': [
            'Lions Athlete',
            'Lions Parent',
            'Lions Sibling',
            'Lions Board Member',
            'Lions Coach',
            'Lions Booster',
            'Lions Alumni'
        ],

        'Other': [
            'Archived',
            'Church/Mission Fundraiser',
            'En Pointe Booster',
            'Freedom Church',
            'Friend/Family of Lions Booster',
            'InGrace Homeschool Fundraiser',
            'Valor Football Player',
            'Youth Missions Trip Fundraiser'
        ]
    },

    // Superseded values mapped to their current equivalent. Retain entries
    // indefinitely: removing one orphans every document still holding the old
    // string.
    //
    // v3  Lions Player/Cheerleader -> Lions Athlete
    // v2  InGrace Homeschool       -> InGrace Homeschool Fundraiser
    // v2  Other Church/Mission     -> Church/Mission Fundraiser
    LEGACY_ALIASES: {
        'Lions Player/Cheerleader': 'Lions Athlete',
        'Lions Player': 'Lions Athlete',
        'Lions Cheerleader': 'Lions Athlete',
        'InGrace Homeschool': 'InGrace Homeschool Fundraiser',
        'Other Church/Mission': 'Church/Mission Fundraiser'
    },

    // Values excluded from invitations, assignment, and reporting. Archived is
    // stored in the relationship field, so an archived record no longer
    // carries its original relationship.
    EXCLUDED_FROM_STAFFING: ['Archived'],

    // Assignment priority. Lower number is assigned first. Values absent from
    // this map fall to the lowest tier. Order within a tier is by declaration
    // time, applied by the caller.
    PRIORITY_TIERS: {
        'Lions Athlete': 1,
        'Lions Parent': 1,
        'Lions Sibling': 1,

        'Lions Coach': 2,
        'Lions Board Member': 2,
        'Lions Booster': 2,
        'Friend/Family of Lions Booster': 2,

        'Lions Alumni': 3,

        'Church/Mission Fundraiser': 4,
        'En Pointe Booster': 4,
        'Freedom Church': 4,
        'InGrace Homeschool Fundraiser': 4,
        'Valor Football Player': 4,
        'Youth Missions Trip Fundraiser': 4
    },

    LOWEST_TIER: 4,

    // Resolves a stored value to its current canonical form. Unrecognised
    // values are returned unchanged so that unexpected data remains visible
    // rather than being silently discarded.
    normalize(relationship) {
        if (!relationship) {
            return '';
        }
        const value = String(relationship).trim();
        return this.LEGACY_ALIASES[value] || value;
    },

    getAllRelationships() {
        return Object.values(this.groups).flat();
    },

    getGroupForRelationship(relationship) {
        const value = this.normalize(relationship);
        for (const [group, relationships] of Object.entries(this.groups)) {
            if (relationships.includes(value)) {
                return group;
            }
        }
        return 'Other';
    },

    isLionsRelationship(relationship) {
        return this.groups.Lions.includes(this.normalize(relationship));
    },

    isStaffable(relationship) {
        return !this.EXCLUDED_FROM_STAFFING.includes(this.normalize(relationship));
    },

    getPriorityTier(relationship) {
        const value = this.normalize(relationship);
        return this.PRIORITY_TIERS[value] || this.LOWEST_TIER;
    },

    // True when the stored value is no longer canonical. Used by the dashboard
    // to surface records that would benefit from a backfill.
    isLegacyValue(relationship) {
        return Object.prototype.hasOwnProperty.call(
            this.LEGACY_ALIASES, String(relationship || '').trim()
        );
    },

    generateOptions(includeEmpty = true) {
        let html = includeEmpty ? '<option value="">Select relationship</option>' : '';

        for (const [groupName, relationships] of Object.entries(this.groups)) {
            html += `<optgroup label="${groupName}">`;
            for (const rel of relationships) {
                html += `<option value="${rel}">${rel}</option>`;
            }
            html += '</optgroup>';
        }
        return html;
    },

    generateFilterOptions() {
        let html = `
            <option value="">All Relationships</option>
            <option value="all-lions">All Lions</option>
        `;

        for (const [groupName, relationships] of Object.entries(this.groups)) {
            html += `<optgroup label="${groupName}">`;
            for (const rel of relationships) {
                html += `<option value="${rel}">${rel}</option>`;
            }
            html += '</optgroup>';
        }
        return html;
    },

    generateExportCheckboxes() {
        let html = `
            <div class="checkbox-option">
                <input type="checkbox" id="export-all-relationships" checked onchange="toggleAllRelationships()">
                <label for="export-all-relationships"><strong>All Relationships</strong></label>
            </div>
        `;

        for (const [groupName, relationships] of Object.entries(this.groups)) {
            for (const rel of relationships) {
                const id = `export-${rel.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
                html += `
                    <div class="checkbox-option">
                        <input type="checkbox" id="${id}" checked onchange="updateExportPreview()">
                        <label for="${id}">${rel}</label>
                    </div>
                `;
            }
        }

        return html;
    },

    generateEmailCheckboxes() {
        let html = `
            <div class="checkbox-option">
                <input type="checkbox" id="email-all-relationships" checked onchange="toggleEmailAllRelationships()">
                <label for="email-all-relationships"><strong>All Relationships</strong></label>
            </div>
        `;

        for (const [groupName, relationships] of Object.entries(this.groups)) {
            for (const rel of relationships) {
                const id = `email-${rel.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
                html += `
                    <div class="checkbox-option">
                        <input type="checkbox" id="${id}" checked onchange="updateEmailPreview()">
                        <label for="${id}">${rel}</label>
                    </div>
                `;
            }
        }

        return html;
    },

    getExportCheckboxIds() {
        const ids = [];
        for (const [groupName, relationships] of Object.entries(this.groups)) {
            for (const rel of relationships) {
                ids.push(`export-${rel.toLowerCase().replace(/[^a-z0-9]/g, '-')}`);
            }
        }
        return ids;
    },

    getEmailCheckboxIds() {
        const ids = [];
        for (const [groupName, relationships] of Object.entries(this.groups)) {
            for (const rel of relationships) {
                ids.push(`email-${rel.toLowerCase().replace(/[^a-z0-9]/g, '-')}`);
            }
        }
        return ids;
    }
};

window.RELATIONSHIP_CONFIG = RELATIONSHIP_CONFIG;


// Routed through the console gate, which is silent unless ?debug=1. This was an
// unconditional banner, and while it printed no page on this property could be
// console-silent on a normal load. The fallback keeps the line working on a
// page that loads this file without /js/lions-log.js.
(window.LIONS_LOG || console).log('Relationship config v'
    + RELATIONSHIP_CONFIG.CONFIG_VERSION + ' loaded.');
