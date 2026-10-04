<?php
/**
 * Plugin Name: 404 SEO Connector
 * Description: Connexion sécurisée à 404 SEO, propositions et annulation des champs SEO, extraits de texte et attributs alt existants.
 * Version: 1.1.0
 * Requires at least: 5.6
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 */
if (!defined('ABSPATH')) { exit; }
require_once __DIR__ . '/Seo404Text.php';

// Dedicated application passwords only. Never accept anonymous requests or a main login password.
add_action('application_password_did_authenticate', function () { $GLOBALS['seo404_application_auth'] = true; });

function seo404_permission($request) {
    if (!is_ssl() || empty($GLOBALS['seo404_application_auth']) || !get_current_user_id()) {
        return new WP_Error('seo404_auth', 'HTTPS et mot de passe d’application requis.', array('status' => 401));
    }
    if ($request->get_param('id')) {
        $post = get_post((int) $request->get_param('id'));
        if (!$post || $post->post_status !== 'publish' || !in_array($post->post_type, array('post', 'page', 'product'), true) ||
            !current_user_can('edit_post', $post->ID)) {
            return new WP_Error('seo404_forbidden', 'Contenu non autorisé.', array('status' => 403));
        }
    } elseif (!current_user_can('edit_posts') && !current_user_can('edit_pages') && !current_user_can('edit_products')) {
        return new WP_Error('seo404_forbidden', 'Droits de modification requis.', array('status' => 403));
    }
    return true;
}

function seo404_text($value, $length) {
    $text = html_entity_decode(wp_strip_all_tags($value, true), ENT_QUOTES, 'UTF-8');
    $text = preg_replace('/[\x00-\x1f\x7f]/u', ' ', $text);
    return preg_match('/^.{0,' . $length . '}/us', $text, $matches) === 1 ? $matches[0] : '';
}

function seo404_resource($id) {
    global $wpdb;
    // Read from the database: do not publish uncommitted metadata into a persistent object cache.
    $post = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE ID = %d", $id));
    if (!$post) { return new WP_Error('seo404_missing', 'Contenu introuvable.', array('status' => 404)); }
    $rows = $wpdb->get_results($wpdb->prepare("SELECT meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key IN ('_seo404_title', '_seo404_description', '_seo404_operation', '_yoast_wpseo_title', '_yoast_wpseo_metadesc', 'rank_math_title', 'rank_math_description') ORDER BY meta_id", $id));
    if (!is_array($rows)) { return new WP_Error('seo404_storage', 'Lecture des champs SEO indisponible.', array('status' => 503)); }
    $meta = array();
    foreach ($rows as $row) { if (!array_key_exists($row->meta_key, $meta)) { $meta[$row->meta_key] = $row->meta_value; } }
    $title = array_key_exists('_seo404_title', $meta) ? (string) $meta['_seo404_title'] : null;
    $description = array_key_exists('_seo404_description', $meta) ? (string) $meta['_seo404_description'] : null;
    $revision = array($post->post_title, $post->post_content, $post->post_excerpt, $post->post_modified_gmt, $title, $description);
    foreach (array('_yoast_wpseo_title', '_yoast_wpseo_metadesc', 'rank_math_title', 'rank_math_description') as $key) {
        $revision[] = isset($meta[$key]) ? $meta[$key] : '';
    }
    return array('id' => (int) $id, 'url' => get_permalink($id), 'title' => seo404_text($post->post_title, 500),
        'kind' => $post->post_type, 'content' => seo404_text($post->post_excerpt . ' ' . $post->post_content, 8000),
        'seoTitle' => $title, 'seoDescription' => $description, 'revision' => hash('sha256', wp_json_encode($revision)),
        'operationId' => isset($meta['_seo404_operation']) ? (string) $meta['_seo404_operation'] : '',
        'segments' => Seo404Text::segments($post->post_content, 'body'));
}

function seo404_storage_ready() {
    global $wpdb;
    foreach (array($wpdb->posts, $wpdb->postmeta) as $table) {
        $engine = $wpdb->get_row($wpdb->prepare('SHOW TABLE STATUS WHERE Name = %s', $table));
        if (!$engine || strtolower($engine->Engine) !== 'innodb') {
            return new WP_Error('seo404_storage', 'Tables InnoDB requises pour les corrections sécurisées.', array('status' => 503));
        }
    }
    return true;
}
// InnoDB row/range locks serialize connector operations and native WordPress edits.
// Fail closed when transactional storage is unavailable.
function seo404_transaction($id, $callback) {
    global $wpdb;
    $ready = seo404_storage_ready();
    if (is_wp_error($ready)) { return $ready; }
    if ($wpdb->query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ') === false || $wpdb->query('START TRANSACTION') === false) {
        return new WP_Error('seo404_storage', 'Transaction indisponible.', array('status' => 503));
    }
    try {
        if ($wpdb->query($wpdb->prepare("SELECT ID FROM {$wpdb->posts} WHERE ID = %d FOR UPDATE", $id)) === false ||
            $wpdb->query($wpdb->prepare("SELECT meta_id FROM {$wpdb->postmeta} WHERE post_id = %d FOR UPDATE", $id)) === false) {
            throw new Exception('lock');
        }
        clean_post_cache($id);
        $result = $callback();
        if (is_wp_error($result)) { $wpdb->query('ROLLBACK'); clean_post_cache($id); return $result; }
        if ($wpdb->query('COMMIT') === false) { throw new Exception('commit'); }
        clean_post_cache($id);
        return $result;
    } catch (Throwable $error) {
        $wpdb->query('ROLLBACK'); clean_post_cache($id);
        return new WP_Error('seo404_storage', 'Modification non confirmée.', array('status' => 503));
    }
}

function seo404_store($id, $key, $value) {
    global $wpdb;
    // These fixed, protected keys belong to this connector only.
    if ($wpdb->delete($wpdb->postmeta, array('post_id' => $id, 'meta_key' => $key), array('%d', '%s')) === false) { throw new Exception('delete'); }
    if ($value !== null && $wpdb->insert($wpdb->postmeta, array('post_id' => $id, 'meta_key' => $key, 'meta_value' => $value), array('%d', '%s', '%s')) === false) { throw new Exception('insert'); }
    wp_cache_delete($id, 'post_meta');
}

function seo404_operation_id($value) { return is_string($value) && preg_match('/^[a-zA-Z0-9-]{1,80}(:restore)?$/D', $value); }
function seo404_write($request) {
    $data = $request->get_json_params();
    if (!is_array($data) || count($data) !== (array_key_exists('patches', $data) ? 5 : 4) || !isset($data['revision'], $data['operationId']) ||
        !array_key_exists('seoTitle', $data) || !array_key_exists('seoDescription', $data) ||
        !is_string($data['revision']) || !preg_match('/^[a-f0-9]{64}$/D', $data['revision']) || !seo404_operation_id($data['operationId'])) {
        return new WP_Error('seo404_input', 'Proposition invalide.', array('status' => 400));
    }
    foreach (array('seoTitle' => 100, 'seoDescription' => 320) as $key => $max) {
        $value = $data[$key];
        if ($value !== null && (!is_string($value) || preg_match('/^.{0,' . $max . '}$/usD', $value) !== 1 || preg_match('/[<>\x00-\x1f\x7f]/u', $value))) {
            return new WP_Error('seo404_input', 'Texte simple requis.', array('status' => 400));
        }
    }
    if (array_key_exists('patches', $data)) {
        try { Seo404Text::patches($data['patches']); foreach ($data['patches'] as $patch) { if (strpos($patch['id'], 'body:') !== 0) { throw new RuntimeException('Invalid field'); } } }
        catch (Throwable $error) { return new WP_Error('seo404_input', 'Textes sélectionnés invalides.', array('status' => 400)); }
    }
    $id = (int) $request['id'];
    return seo404_transaction($id, function () use ($id, $data, $request) {
        $permission = seo404_permission($request);
        if (is_wp_error($permission)) { return $permission; }
        $current = seo404_resource($id);
        $cancelled = get_post_meta($id, '_seo404_cancelled', true);
        if (is_array($cancelled) && in_array($data['operationId'], $cancelled, true)) {
            return new WP_Error('seo404_cancelled', 'Opération annulée.', array('status' => 409));
        }
        if ($current['operationId'] === $data['operationId']) { return $current; }
        if (!hash_equals($current['revision'], $data['revision'])) {
            return new WP_Error('seo404_conflict', 'Contenu modifié depuis la proposition.', array('status' => 409));
        }
        if (isset($data['patches'])) {
            global $wpdb;
            $post = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE ID = %d", $id));
            $content = Seo404Text::apply($post->post_content, 'body', $data['patches']);
            if ($wpdb->update($wpdb->posts, array('post_content' => $content), array('ID' => $id), array('%s'), array('%d')) === false) { throw new RuntimeException('Content update failed'); }
        }
        seo404_store($id, '_seo404_title', $data['seoTitle']);
        seo404_store($id, '_seo404_description', $data['seoDescription']);
        seo404_store($id, '_seo404_operation', $data['operationId']);
        return seo404_resource($id);
    });
}

function seo404_reconcile($request) {
    $data = $request->get_json_params();
    if (!is_array($data) || count($data) !== 1 || !isset($data['operationId']) || !seo404_operation_id($data['operationId'])) {
        return new WP_Error('seo404_input', 'Opération invalide.', array('status' => 400));
    }
    $id = (int) $request['id'];
    return seo404_transaction($id, function () use ($id, $data, $request) {
        $permission = seo404_permission($request);
        if (is_wp_error($permission)) { return $permission; }
        $current = seo404_resource($id);
        if ($current['operationId'] !== $data['operationId']) {
            // Durable tombstone: a delayed request is rejected even after the HTTP client timed out.
            $cancelled = get_post_meta($id, '_seo404_cancelled', true);
            $cancelled = is_array($cancelled) ? $cancelled : array();
            if (!in_array($data['operationId'], $cancelled, true)) {
                if (count($cancelled) >= 1000) { return new WP_Error('seo404_storage', 'Limite de réconciliation atteinte.', array('status' => 503)); }
                $cancelled[] = $data['operationId'];
                seo404_store($id, '_seo404_cancelled', maybe_serialize($cancelled));
            }
        }
        return seo404_resource($id);
    });
}

add_action('rest_api_init', function () {
    $permission = 'seo404_permission';
    register_rest_route('seo404/v1', '/connection', array('methods' => 'GET', 'permission_callback' => $permission,
        'callback' => function () {
            $ready = seo404_storage_ready();
            return is_wp_error($ready) ? $ready : array('version' => 1, 'siteUrl' => home_url('/'), 'label' => seo404_text(get_bloginfo('name'), 200));
        }));
    register_rest_route('seo404/v1', '/resources', array('methods' => 'GET', 'permission_callback' => $permission,
        'args' => array('kind' => array('default' => 'page', 'validate_callback' => function ($value) { return in_array($value, array('post', 'page', 'product'), true); }),
            'page' => array('default' => 1, 'validate_callback' => function ($value) { return ctype_digit((string) $value) && (int) $value >= 1 && (int) $value <= 1000; })),
        'callback' => function ($request) {
            $query = new WP_Query(array('post_type' => $request['kind'], 'post_status' => 'publish', 'posts_per_page' => 25,
                'paged' => (int) $request['page'], 'orderby' => 'ID', 'order' => 'ASC'));
            $resources = array();
            foreach ($query->posts as $post) { if (current_user_can('edit_post', $post->ID)) { $resources[] = seo404_resource($post->ID); } }
            return array('resources' => $resources, 'hasMore' => (int) $request['page'] < $query->max_num_pages);
        }));
    register_rest_route('seo404/v1', '/resources/(?P<id>\d+)', array(
        array('methods' => 'GET', 'permission_callback' => $permission, 'callback' => function ($request) { return seo404_resource((int) $request['id']); }),
        array('methods' => 'POST', 'permission_callback' => $permission, 'callback' => 'seo404_write')));
    register_rest_route('seo404/v1', '/resources/(?P<id>\d+)/reconcile', array('methods' => 'POST', 'permission_callback' => $permission, 'callback' => 'seo404_reconcile'));
});

function seo404_override($fallback, $field) {
    if (!is_singular(array('post', 'page', 'product'))) { return $fallback; }
    $id = get_queried_object_id();
    $key = $field === 'title' ? '_seo404_title' : '_seo404_description';
    return metadata_exists('post', $id, $key) ? get_post_meta($id, $key, true) : $fallback;
}
add_filter('wpseo_title', function ($value) { return seo404_override($value, 'title'); }, 99);
add_filter('wpseo_metadesc', function ($value) { return seo404_override($value, 'description'); }, 99);
add_filter('rank_math/frontend/title', function ($value) { return seo404_override($value, 'title'); }, 99);
add_filter('rank_math/frontend/description', function ($value) { return seo404_override($value, 'description'); }, 99);
add_filter('pre_get_document_title', function ($value) {
    if (defined('WPSEO_VERSION') || defined('RANK_MATH_VERSION')) { return $value; }
    return esc_html(seo404_override($value, 'title'));
}, 99);
add_action('wp_head', function () {
    if (defined('WPSEO_VERSION') || defined('RANK_MATH_VERSION') || !is_singular(array('post', 'page', 'product'))) { return; }
    $description = seo404_override(null, 'description');
    if ($description !== null && $description !== '') { echo '<meta name="description" content="' . esc_attr($description) . '">' . "\n"; }
}, 2);

// Make overrides visible in the native editor and offer an escape hatch without the SaaS.
add_action('add_meta_boxes', function () {
    foreach (array('post', 'page', 'product') as $type) {
        add_meta_box('seo404_overrides', '404 SEO — champs publiés', function ($post) {
            if (!metadata_exists('post', $post->ID, '_seo404_title') && !metadata_exists('post', $post->ID, '_seo404_description')) {
                echo '<p>Aucune valeur imposée par 404 SEO.</p>'; return;
            }
            echo '<p>Ces valeurs ont priorité sur les réglages habituels du CMS tant que le connecteur est actif.</p>';
            echo '<p><strong>Titre SEO :</strong> ' . esc_html(get_post_meta($post->ID, '_seo404_title', true)) . '</p>';
            echo '<p><strong>Description :</strong> ' . esc_html(get_post_meta($post->ID, '_seo404_description', true)) . '</p>';
            wp_nonce_field('seo404_reset_' . $post->ID, 'seo404_reset_nonce');
            echo '<label><input type="checkbox" name="seo404_reset" value="1"> Revenir aux réglages habituels du CMS lors de la sauvegarde</label>';
        }, $type, 'normal', 'default');
    }
});
add_action('save_post', function ($id) {
    if (empty($_POST['seo404_reset']) || empty($_POST['seo404_reset_nonce']) || !is_string($_POST['seo404_reset_nonce']) ||
        !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['seo404_reset_nonce'])), 'seo404_reset_' . $id) ||
        !current_user_can('edit_post', $id) || wp_is_post_revision($id) || wp_is_post_autosave($id)) { return; }
    seo404_transaction($id, function () use ($id) {
        seo404_store($id, '_seo404_title', null); seo404_store($id, '_seo404_description', null);
        seo404_store($id, '_seo404_operation', 'manual-reset'); return true;
    });
});
