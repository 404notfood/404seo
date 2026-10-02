<?php
/** Plain-text patches only. Original markup, attributes, comments and protected blocks stay byte-identical. */
class Seo404Text
{
    public static function tokens($html, $prefix)
    {
        if (strlen($html) > 200000) { return array(); }
        preg_match_all('/<!--[\s\S]*?-->|<(?:[^<>"\']|"[^"]*"|\'[^\']*\')*>|[^<]+|</', $html, $matches, PREG_OFFSET_CAPTURE);
        $result = array(); $protected = array();
        foreach ($matches[0] as $index => $match) {
            $raw = $match[0]; $offset = $match[1];
            if (substr($raw, 0, 4) === '<!--') { continue; }
            if ($raw[0] === '<') {
                if (preg_match('/^<\s*(\/?)\s*(script|style|pre|code|textarea|iframe|object|template|svg|math|a)\b/i', $raw, $tag)) {
                    $name = strtolower($tag[2]);
                    if ($tag[1] === '/') { if (end($protected) === $name) { array_pop($protected); } }
                    elseif (!preg_match('/\/\s*>$/', $raw)) { $protected[] = $name; }
                    continue;
                }
                if (!$protected && preg_match('/^<img\b/i', $raw) && preg_match('/\s(alt)\s*=\s*(["\'])(.*?)\2/is', $raw, $alt, PREG_OFFSET_CAPTURE)) {
                    $text = html_entity_decode($alt[3][0], ENT_QUOTES | ENT_HTML5, 'UTF-8');
                    if (self::valid($text, 200) && trim($text) !== '') { $result[] = array('id' => $prefix . ':a:' . $index, 'text' => $text, 'offset' => $offset + $alt[3][1], 'length' => strlen($alt[3][0]), 'type' => 'ALT'); }
                }
                continue;
            }
            $text = html_entity_decode($raw, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            // Shortcodes, templates and code-like text are intentionally excluded.
            if (!$protected && trim($text) !== '' && !preg_match('/[\[\]{}]|https?:\/\//i', $text) && self::valid($text, 400)) {
                $result[] = array('id' => $prefix . ':t:' . $index, 'text' => $text, 'offset' => $offset, 'length' => strlen($raw), 'type' => 'CONTENT');
            }
        }
        return array_slice($result, 0, 100);
    }
    public static function valid($text, $max)
    {
        return is_string($text) && preg_match('/^.{0,' . $max . '}$/usD', $text) === 1 && !preg_match('/[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u', $text);
    }
    public static function segments($html, $prefix)
    {
        $counts = array('CONTENT' => 0, 'ALT' => 0); $segments = array();
        foreach (self::tokens($html, $prefix) as $token) { if ($counts[$token['type']]++ < 8) { $segments[] = array('id' => $token['id'], 'text' => $token['text'], 'type' => $token['type']); } }
        return $segments;
    }
    public static function patches($value)
    {
        if (!is_array($value) || count($value) < 1 || count($value) > 8 || array_keys($value) !== range(0, count($value) - 1)) { throw new RuntimeException('Invalid text patches'); }
        $ids = array();
        foreach ($value as $patch) {
            if (!is_array($patch) || count($patch) !== 2 || !isset($patch['id'], $patch['text']) || !is_string($patch['id']) || !preg_match('/^(body|description|short):[ta]:[0-9]{1,6}$/D', $patch['id']) || !self::valid($patch['text'], strpos($patch['id'], ':a:') !== false ? 200 : 400) || trim($patch['text']) === '' || isset($ids[$patch['id']])) { throw new RuntimeException('Invalid text patches'); }
            $ids[$patch['id']] = true;
        }
        return $value;
    }
    public static function apply($html, $prefix, $patches)
    {
        $tokens = array(); foreach (self::tokens($html, $prefix) as $token) { $tokens[$token['id']] = $token; }
        $changes = array();
        foreach ($patches as $patch) {
            if (strpos($patch['id'], $prefix . ':') !== 0) { continue; }
            if (!isset($tokens[$patch['id']])) { throw new RuntimeException('Text segment unavailable'); }
            $token = $tokens[$patch['id']];
            // Leading/trailing whitespace is part of the source text, including inline spacing.
            if ($token['type'] === 'CONTENT' && (preg_match('/^\s*/u', $token['text'], $left) !== 1 || preg_match('/^\s*/u', $patch['text'], $nextLeft) !== 1 || $left[0] !== $nextLeft[0] || preg_match('/\s*$/u', $token['text'], $right) !== 1 || preg_match('/\s*$/u', $patch['text'], $nextRight) !== 1 || $right[0] !== $nextRight[0])) { throw new RuntimeException('Whitespace changed'); }
            $token['replacement'] = htmlspecialchars($patch['text'], ENT_QUOTES | ENT_HTML5, 'UTF-8'); $changes[] = $token;
        }
        usort($changes, function ($a, $b) { return $b['offset'] - $a['offset']; });
        foreach ($changes as $change) { $html = substr_replace($html, $change['replacement'], $change['offset'], $change['length']); }
        return $html;
    }
}
