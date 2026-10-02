<?php
if (!defined('_PS_VERSION_')) { exit; }

class Seo404connector extends Module
{
    public function __construct()
    {
        $this->name = 'seo404connector'; $this->tab = 'seo'; $this->version = '1.0.0';
        $this->author = '404 SEO'; $this->bootstrap = true;
        $this->ps_versions_compliancy = array('min' => '8.0.0', 'max' => '9.99.99');
        parent::__construct();
        $this->displayName = '404 SEO Connector';
        $this->description = 'Propositions, publication et annulation des champs SEO produits, dans une boutique et une langue choisies.';
    }
    public function install()
    {
        if (version_compare(PHP_VERSION, '7.4.0', '<')) { return false; }
        $db = Db::getInstance();
        return $db->execute('CREATE TABLE IF NOT EXISTS `' . _DB_PREFIX_ . 'seo404_settings` (
            id INT NOT NULL PRIMARY KEY, token_hash CHAR(64) NOT NULL, id_shop INT NOT NULL, id_lang INT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4') &&
            $db->execute('INSERT IGNORE INTO `' . _DB_PREFIX_ . "seo404_settings` VALUES (1, '', 0, 0)") &&
            $db->execute('CREATE TABLE IF NOT EXISTS `' . _DB_PREFIX_ . 'seo404_operations` (
                id_product INT NOT NULL, id_shop INT NOT NULL, id_lang INT NOT NULL,
                operation_id VARCHAR(100) NOT NULL DEFAULT \'\', cancelled MEDIUMTEXT NOT NULL,
                PRIMARY KEY (id_product, id_shop, id_lang)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4') && parent::install();
    }
    // Keep the operation ledger on uninstall: deleting cancellation markers could replay a delayed request.
    public function uninstall()
    {
        return Db::getInstance()->execute('UPDATE `' . _DB_PREFIX_ . 'seo404_settings` SET token_hash=\'\' WHERE id=1') && parent::uninstall();
    }
    public function getContent()
    {
        if (empty($this->context->employee->id) || !$this->getPermission('configure', $this->context->employee)) {
            return '<div class="alert alert-danger">Configuration du module non autorisée.</div>';
        }
        $escape = function ($text) { return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8'); };
        if (Shop::getContext() !== Shop::CONTEXT_SHOP) {
            return '<div class="alert alert-warning">Sélectionnez une seule boutique dans le back-office avant de configurer le connecteur.</div>';
        }
        $shop = (int) $this->context->shop->id;
        $languages = Language::getLanguages(true, $shop);
        $html = '<h2>404 SEO — connexion dédiée</h2><p>La clé autorise uniquement la lecture et les deux champs SEO des produits de la boutique et de la langue choisies. Une seule boutique/langue est autorisée à la fois sur cette installation.</p>';
        $csrf = Tools::getAdminTokenLite('AdminModules');
        if (Tools::isSubmit('seo404_generate')) {
            $posted = Tools::getValue('seo404_csrf'); $lang = (int) Tools::getValue('seo404_language');
            $allowed = array_map(function ($item) { return (int) $item['id_lang']; }, $languages);
            if (!is_string($posted) || !hash_equals($csrf, $posted) || !in_array($lang, $allowed, true)) {
                return $html . '<div class="alert alert-danger">Demande invalide.</div>';
            }
            $token = bin2hex(random_bytes(32));
            if (!Db::getInstance()->execute('UPDATE `' . _DB_PREFIX_ . 'seo404_settings` SET token_hash=\'' . pSQL(hash('sha256', $token)) . '\', id_shop=' . $shop . ', id_lang=' . $lang . ' WHERE id=1')) {
                return $html . '<div class="alert alert-danger">Enregistrement indisponible.</div>';
            }
            $html .= '<div class="alert alert-success">Copiez cette clé maintenant : elle ne sera plus affichée. L’ancienne clé est révoquée.<br><code>' . $escape($token) . '</code></div>';
        }
        $settings = Db::getInstance()->getRow('SELECT id_shop, id_lang FROM `' . _DB_PREFIX_ . 'seo404_settings` WHERE id=1', false);
        $html .= '<p>Adresse HTTPS : <code>' . $escape($this->context->link->getBaseLink($shop, true)) . '</code></p>';
        $html .= '<p>Périmètre enregistré : boutique ' . (int) $settings['id_shop'] . ', langue ' . (int) $settings['id_lang'] . '.</p>';
        $html .= '<p>Les valeurs sont enregistrées dans les champs natifs PrestaShop et restent présentes si le module est désactivé. Vérifiez toute opération en attente dans la plateforme avant de changer de périmètre.</p>';
        $html .= '<form method="post"><input type="hidden" name="seo404_csrf" value="' . $escape($csrf) . '"><label>Langue <select name="seo404_language">';
        foreach ($languages as $language) { $html .= '<option value="' . (int) $language['id_lang'] . '">' . $escape($language['name']) . '</option>'; }
        return $html . '</select></label> <button class="btn btn-primary" name="seo404_generate" value="1">Générer une nouvelle clé pour cette boutique/langue</button></form>';
    }
}
