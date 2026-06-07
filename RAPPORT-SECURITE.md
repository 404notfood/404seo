# 🔐 Rapport de sécurité — Compromission VPS

> Date du diagnostic : 2026-06-05
> Incident : ancien VPS compromis (16 backdoors), réinstallé. Nouveau VPS Hestia propre, non redéployé.

---

## 1. Résumé de l'incident

| Élément | Constat |
|---------|---------|
| **Type d'attaque** | Web shells PHP multi-sites (PAS un rootkit, PAS de minage) |
| **Signature malware** | `.php` de **2620 octets**, `root:root`, daté **26 mai 00:45** |
| **Noms utilisés** | `xcbin.php`, `widget-functions.php`, `filter-validator.php`, `router-hook.php` |
| **Cachettes** | webroots, `node_modules/hasown/`, `.git/objects/` |
| **Sites touchés** | `lcr`, `seo`, `Laurent` (multi-sites → propagation latérale) |
| **Domaine malveillant** | `betvoleguncelgirislerde` (spam/SEO turc — typique d'un réseau de spam) |
| **Persistance** | ❌ Aucun cron, ❌ aucune clé SSH pirate, ❌ aucun user Linux suspect |
| **Accès root permanent** | Probablement NON (mais fichiers en `root:root` = point à éclaircir) |

### Interprétation
Infection de type **SEO spam / injection de backdoors** par un botnet automatisé.
Le domaine `betvole...` (paris en ligne turcs) indique un réseau qui pirate des sites
pour y injecter du spam et des portes dérobées revendues. Entrée très probable :
**un site PHP vulnérable** (CMS custom "artisancms", ou WordPress non à jour),
puis propagation à tous les sites du serveur.

---

## 2. Point critique à éclaircir : `root:root`

Les backdoors appartenaient à **root**, pas à l'utilisateur du site.
2 explications possibles — la 1ère est la plus probable et la plus importante à corriger :

1. **PHP/PHP-FPM tournait en root** sur le serveur (mauvaise config Hestia) →
   une simple faille web donne alors un accès root. **À NE JAMAIS reproduire.**
2. Élévation de privilège après l'entrée (moins probable vu l'absence de rootkit).

➡️ **Sur le nouveau VPS** : chaque site DOIT tourner sous son propre utilisateur
(`seo:seo`, `lcr:lcr`…) via un pool PHP-FPM dédié. Hestia le fait par défaut —
il faut juste vérifier qu'aucun vhost ne tourne en root.

---

## 3. Scan du code local (D:/Logiciel/laragon/www) — RÉSULTAT

✅ **Aucune backdoor active trouvée** dans le code local :
- Aucun fichier `xcbin.php` / `widget-functions.php` / `filter-validator.php` / `router-hook.php`
- Aucune trace de la signature `betvoleguncelgirislerde` / du hash
- Les fichiers de 2620 octets trouvés sont des libs **légitimes** (Carbon, Symfony, WP-SEO…)

⚠️ **MAIS à scanner encore avant tout redéploiement** :
- `.git/objects/` de chaque repo (la backdoor s'y planquait sur le VPS)
- `www.zip` (387 Mo, daté 2014 — archive inconnue à vérifier ou supprimer)
- Les WordPress (`ippress`, `cbd2`) : plugins/thèmes = vecteur n°1

---

## 4. PLAN D'ACTION (ordre strict)

### Phase A — Avant de redéployer quoi que ce soit
- [ ] **Identifier la faille d'entrée** : auditer le CMS custom `articms`/`new-cms`
      (uploads de fichiers non validés, `move_uploaded_file` sans contrôle d'extension,
      include dynamique `include $_GET[...]`, désérialisation, etc.)
- [ ] **Mettre à jour** tous les WordPress + plugins/thèmes, ou les supprimer si inutiles
- [ ] **Changer TOUS les secrets** (ils sont à considérer comme fuités) :
      mots de passe DB, clés API (Stripe, Google, Anthropic, Resend), `BETTER_AUTH_SECRET`,
      tokens, mots de passe Hestia, mots de passe SSH/utilisateurs
- [ ] **Scanner les `.git`** de chaque projet avant push/pull

### Phase B — Durcissement du nouveau VPS (avant déploiement)
- [ ] **Firewall** : n'ouvrir QUE 22 (SSH), 80, 443, 8083 (Hestia, idéalement restreint à ton IP).
      **FERMER** 6379 (Redis), 5432 (PostgreSQL), 3306 (MySQL) au monde extérieur
- [ ] **Redis** : `bind 127.0.0.1 ::1` + `requirepass <long>` + `protected-mode yes`
- [ ] **PostgreSQL/MySQL** : bind localhost uniquement, mots de passe forts
- [ ] **SSH** : `PermitRootLogin no` + `PasswordAuthentication no` (clés uniquement)
- [ ] **fail2ban** : installer + activer (jails sshd + hestia)
- [ ] **PHP-FPM** : 1 pool par site sous son user dédié (jamais root)
- [ ] **Hestia** : à jour, panel restreint à ton IP si possible
- [ ] **Mises à jour auto de sécurité** : `unattended-upgrades`

### Phase C — Après déploiement (surveillance)
- [ ] Installer un détecteur d'intégrité : `aide` ou scan régulier de web shells
- [ ] Scan régulier : `find /home/*/web -name "*.php" -newermt "<date>"` pour repérer
      tout nouveau .php suspect
- [ ] Sauvegardes hors-site (pour pouvoir comparer/restaurer proprement)
- [ ] Surveiller les logs d'accès (pics de requêtes POST vers des .php inconnus)

---

## 5. Règles d'or pour ne PAS se refaire pirater

1. **Un VPS multi-sites = surface d'attaque partagée.** Un seul site faible
   compromet tous les autres. Isoler les users PHP-FPM est vital.
2. **Aucun CMS custom en prod sans audit de sécurité** (uploads, includes, SQL).
3. **Redis/DB jamais exposés à Internet.** C'est la cause n°1 de compromission VPS.
4. **Secrets jamais commités dans Git**, et rotation après tout incident.
5. **Tout mettre à jour** : OS, Hestia, WordPress, plugins, dépendances.
