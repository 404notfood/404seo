<?php
// Focused harness for the plugin's permissions, validation, CAS, rollback and delayed requests.
// SQL storage is simulated here; actual MySQL/InnoDB integration requires a WordPress staging site.
define('ABSPATH', __DIR__);
$GLOBALS['seo404_application_auth'] = true;
$GLOBALS['allowed'] = true; $GLOBALS['ssl'] = true; $GLOBALS['meta'] = array(); $GLOBALS['actions'] = array(); $GLOBALS['filters'] = array();
$GLOBALS['post'] = (object) array('ID' => 1, 'post_status' => 'publish', 'post_type' => 'page', 'post_title' => 'Page',
    'post_content' => 'Informations fiables', 'post_excerpt' => '', 'post_modified_gmt' => '2026-10-02 10:00:00');
class WP_Error {
    public $code; public $data;
    function __construct($code, $message, $data = array()) { $this->code = $code; $this->data = $data; }
}
class Request implements ArrayAccess {
    private $data;
    function __construct($data = array()) { $this->data = $data; }
    function get_json_params() { return $this->data; }
    function get_param($key) { return $key === 'id' ? 1 : null; }
    function offsetExists($offset): bool { return $offset === 'id'; }
    function offsetGet($offset): mixed { return $this->get_param($offset); }
    function offsetSet($offset, $value): void {}
    function offsetUnset($offset): void {}
}
class Database {
    public $posts = 'wp_posts'; public $postmeta = 'wp_postmeta'; public $failInsert = false; private $snapshot;
    function prepare($query, ...$args) { return array($query, $args); }
    function get_row($query) {
        if (str_starts_with($query[0], 'SHOW')) { return (object) array('Engine' => 'InnoDB'); }
        return $GLOBALS['post'];
    }
    function get_results($query) {
        $rows = array();
        foreach ($GLOBALS['meta'] as $key => $value) { if ($key !== '_seo404_cancelled') { $rows[] = (object) array('meta_key' => $key, 'meta_value' => $value); } }
        return $rows;
    }
    function query($query) {
        if ($query === 'START TRANSACTION') { $this->snapshot = array($GLOBALS['meta'], clone $GLOBALS['post']); }
        if ($query === 'ROLLBACK') { $GLOBALS['meta'] = $this->snapshot[0]; $GLOBALS['post'] = $this->snapshot[1]; }
        return 1;
    }
    function delete($table, $where, $types) { unset($GLOBALS['meta'][$where['meta_key']]); return 1; }
    function update($table, $data, $where, $types, $whereTypes) { foreach ($data as $key => $value) { $GLOBALS['post']->$key = $value; } return 1; }
    function insert($table, $data, $types) {
        if ($this->failInsert) { $this->failInsert = false; return false; }
        $GLOBALS['meta'][$data['meta_key']] = $data['meta_value']; return 1;
    }
}
$wpdb = new Database();
function add_action($name, $callback, $priority = 10) { $GLOBALS['actions'][$name][] = $callback; }
function add_filter($name, $callback, $priority = 10) { $GLOBALS['filters'][$name] = $callback; }
function is_ssl() { return $GLOBALS['ssl']; }
function get_current_user_id() { return 1; }
function get_post($id) { return $GLOBALS['post']; }
function current_user_can(...$args) { return $GLOBALS['allowed']; }
function clean_post_cache($id) {}
function wp_cache_delete($id, $group) {}
function wp_strip_all_tags($value, $breaks = false) { return strip_tags(preg_replace('@<(script|style)[^>]*?>.*?</\\1>@si', '', $value)); }
function wp_json_encode($value) { return json_encode($value); }
function metadata_exists($kind, $id, $key) { return array_key_exists($key, $GLOBALS['meta']); }
function get_post_meta($id, $key, $single) {
    $value = $GLOBALS['meta'][$key] ?? '';
    return $key === '_seo404_cancelled' && is_string($value) && $value !== '' ? unserialize($value, array('allowed_classes' => false)) : $value;
}
function maybe_serialize($value) { return serialize($value); }
function get_permalink($id) { return 'https://example.com/page'; }
function is_wp_error($value) { return $value instanceof WP_Error; }
function is_singular($types) { return true; }
function get_queried_object_id() { return 1; }
function esc_html($value) { return htmlspecialchars($value, ENT_QUOTES, 'UTF-8'); }
function esc_attr($value) { return esc_html($value); }
require __DIR__ . '/../../integrations/wordpress/seo404-connector/seo404-connector.php';
function check($value, $message) { if (!$value) { throw new Exception($message); } }
$initial = seo404_resource(1);
$body = array('revision' => $initial['revision'], 'operationId' => 'first-approval', 'seoTitle' => 'Titre SEO', 'seoDescription' => 'Description SEO');
$GLOBALS['allowed'] = false; check(seo404_permission(new Request()) instanceof WP_Error, 'Permissions denied');
$GLOBALS['allowed'] = true; $GLOBALS['ssl'] = false; check(seo404_permission(new Request()) instanceof WP_Error, 'HTTPS required'); $GLOBALS['ssl'] = true;
$GLOBALS['seo404_application_auth'] = false; check(seo404_permission(new Request()) instanceof WP_Error, 'Application authentication required'); $GLOBALS['seo404_application_auth'] = true;
$bad = $body; $bad['seoTitle'] = '<script>alert(1)</script>'; check(seo404_write(new Request($bad))->data['status'] === 400, 'HTML rejected');
$bad = $body; $bad['revision'] = array(); check(seo404_write(new Request($bad))->data['status'] === 400, 'Wrong types rejected');
$wpdb->failInsert = true; check(seo404_write(new Request($body))->data['status'] === 503, 'Failed transaction');
check(seo404_resource(1)['seoTitle'] === null, 'Failure rolled back');
$applied = seo404_write(new Request($body)); check($applied['seoTitle'] === 'Titre SEO', 'Approved title stored');
check($GLOBALS['post']->post_title === 'Page', 'Visible title preserved');
check(seo404_write(new Request($body))['revision'] === $applied['revision'], 'Repeated operation idempotent');
check(($GLOBALS['filters']['wpseo_title'])('Original') === 'Titre SEO', 'Yoast title filter');
check(($GLOBALS['filters']['rank_math/frontend/description'])('Original') === 'Description SEO', 'Rank Math description filter');
check(seo404_reconcile(new Request(array('operationId' => 'first-approval')))['revision'] === $applied['revision'], 'Confirmed write reconciles');
$restore = array('revision' => $applied['revision'], 'operationId' => 'restore-approval', 'seoTitle' => null, 'seoDescription' => null);
$restored = seo404_write(new Request($restore)); check($restored['seoTitle'] === null && $restored['seoDescription'] === null, 'Overrides removed on restoration');
check(($GLOBALS['filters']['wpseo_title'])('Original') === 'Original', 'Native fallback restored');
$delayed = array('revision' => $restored['revision'], 'operationId' => 'delayed-request', 'seoTitle' => 'Late title', 'seoDescription' => 'Late description');
seo404_reconcile(new Request(array('operationId' => 'delayed-request')));
check(seo404_write(new Request($delayed))->data['status'] === 409, 'Cancelled delayed request can never write');
$new = $delayed; $new['operationId'] = 'new-approved-request'; check(seo404_write(new Request($new))['seoTitle'] === 'Late title', 'Fresh approval remains possible');
$fresh = seo404_resource(1); $GLOBALS['post']->post_content = 'Changed by editor';
$stale = $body; $stale['operationId'] = 'stale-request'; $stale['revision'] = $fresh['revision'];
check(seo404_write(new Request($stale))->data['status'] === 409, 'Native content edit causes conflict');
$html = '<!-- wp:paragraph --><p class="x">Des chaussure rouges à 25 € &amp; confortables.</p><img src="/rouge.jpg" alt="Chaussure rouje" width="100"><pre>ne pa toucher</pre><a href="/achat">acheter</a><script>var secret = "x";</script><!-- /wp:paragraph -->';
$GLOBALS['post']->post_content = $html; $fresh = seo404_resource(1);
check(count($fresh['segments']) === 2, 'Only compatible visible text and existing image alt are exposed');
$patches = array(array('id' => $fresh['segments'][0]['id'], 'text' => 'Des chaussures rouges à 25 € & confortables.'), array('id' => $fresh['segments'][1]['id'], 'text' => 'Chaussure rouge'));
$body = array('revision' => $fresh['revision'], 'operationId' => 'text-approved', 'seoTitle' => $fresh['seoTitle'], 'seoDescription' => $fresh['seoDescription'], 'patches' => $patches);
$wpdb->failInsert = true; check(seo404_write(new Request($body))->data['status'] === 503, 'Text and metadata fail atomically'); check($GLOBALS['post']->post_content === $html, 'Text rollback');
$next = seo404_write(new Request($body)); check(!is_wp_error($next), 'Text publication');
$expected = str_replace(array('Des chaussure', 'Chaussure rouje'), array('Des chaussures', 'Chaussure rouge'), $html);
check($GLOBALS['post']->post_content === $expected, 'Markup, comments, protected text, attributes and factual data preserved');
$restore = array('revision' => $next['revision'], 'operationId' => 'text-restore', 'seoTitle' => $fresh['seoTitle'], 'seoDescription' => $fresh['seoDescription'], 'patches' => array_map(function ($segment) { return array('id' => $segment['id'], 'text' => $segment['text']); }, $fresh['segments']));
check(!is_wp_error(seo404_write(new Request($restore))) && $GLOBALS['post']->post_content === $html, 'Text and alt restoration');
$bad = $restore; $bad['operationId'] = 'bad-text'; $bad['patches'][0]['text'] = '<script>x</script>'; check(seo404_write(new Request($bad))->data['status'] === 400, 'Patch HTML rejected');
echo "Plugin permissions, validation, CAS, transaction failure, rendering hooks, restoration and delayed cancellation passed.\n";
