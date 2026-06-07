#!/usr/bin/env bash
#
# security-diagnostic.sh — Diagnostic sécurité VPS (LECTURE SEULE, aucune modif)
# Stack cible : HestiaCP + PM2 + Node + Redis + PostgreSQL
#
# Usage :  sudo bash security-diagnostic.sh
# Copie-colle la sortie complète pour analyse.
#
set -u
RED=$'\e[31m'; GRN=$'\e[32m'; YEL=$'\e[33m'; CYN=$'\e[36m'; RST=$'\e[0m'
hr(){ printf '%s\n' "------------------------------------------------------------"; }
sec(){ echo; hr; echo "${CYN}### $1${RST}"; hr; }
ok(){  echo "${GRN}[OK]${RST} $1"; }
warn(){ echo "${YEL}[!] $1${RST}"; }
bad(){ echo "${RED}[!!] $1${RST}"; }

echo "${CYN}=== DIAGNOSTIC SÉCURITÉ VPS — $(date) ===${RST}"
echo "Hostname : $(hostname)   Kernel : $(uname -r)"
echo "Uptime   : $(uptime -p 2>/dev/null)"
[ "$(id -u)" -ne 0 ] && warn "Pas lancé en root — certaines sections seront incomplètes (relance avec sudo)."

# ─────────────────────────────────────────────────────────────
sec "1. PORTS EN ÉCOUTE (le plus important)"
echo "Cherche : 6379 (Redis), 5432 (PostgreSQL), 8083 (Hestia) écoutant sur 0.0.0.0/*"
echo
if command -v ss >/dev/null; then
  ss -tulnp 2>/dev/null | awk 'NR==1 || /LISTEN/ || /UNCONN/'
else
  netstat -tulnp 2>/dev/null
fi
echo
echo "${YEL}>> Tout ce qui écoute sur 0.0.0.0 ou *:PORT (≠ 127.0.0.1) est exposé à Internet.${RST}"
echo "${YEL}>> Redis (6379) et PostgreSQL (5432) NE DOIVENT JAMAIS être sur 0.0.0.0.${RST}"

# ─────────────────────────────────────────────────────────────
sec "2. FIREWALL"
if command -v ufw >/dev/null && ufw status >/dev/null 2>&1; then
  echo "[UFW]"; ufw status verbose
elif command -v iptables >/dev/null; then
  echo "[iptables]"; iptables -L -n -v 2>/dev/null | head -60
fi
echo
echo "[HestiaCP firewall (si présent)]"
[ -f /usr/local/hestia/data/firewall/rules.conf ] && cat /usr/local/hestia/data/firewall/rules.conf || echo "  (pas de config firewall Hestia trouvée)"

# ─────────────────────────────────────────────────────────────
sec "3. CONFIG SSH"
SSHD=/etc/ssh/sshd_config
if [ -f "$SSHD" ]; then
  echo "Réglages effectifs (lignes non commentées) :"
  grep -Ei '^\s*(Port|PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|PermitEmptyPasswords|AllowUsers|AllowGroups)\b' "$SSHD" || echo "  (valeurs par défaut)"
  echo
  grep -Eiq '^\s*PermitRootLogin\s+yes' "$SSHD" && bad "PermitRootLogin yes — root accessible par SSH (risqué)" || ok "Root login SSH restreint ou désactivé"
  grep -Eiq '^\s*PasswordAuthentication\s+no' "$SSHD" && ok "Auth par mot de passe désactivée (clés uniquement)" || bad "PasswordAuthentication actif — brute-force possible"
fi

# ─────────────────────────────────────────────────────────────
sec "4. COMPTES UTILISATEURS & SUDO"
echo "Comptes avec shell de login :"
grep -E ':/bin/(bash|sh|zsh)$' /etc/passwd
echo
echo "Comptes UID 0 (doit être 'root' UNIQUEMENT) :"
awk -F: '$3==0{print "  "$1" (UID 0)"}' /etc/passwd
echo
echo "Membres du groupe sudo/wheel :"
getent group sudo 2>/dev/null; getent group wheel 2>/dev/null
echo
echo "Comptes sans mot de passe (champ vide = DANGER) :"
awk -F: '($2==""){print "  "$1}' /etc/shadow 2>/dev/null || echo "  (lecture /etc/shadow nécessite root)"

# ─────────────────────────────────────────────────────────────
sec "5. CLÉS SSH AUTORISÉES (backdoor classique)"
for home in /root /home/*; do
  ak="$home/.ssh/authorized_keys"
  if [ -f "$ak" ]; then
    echo "Fichier : $ak"
    awk '{print "  "$1" "$NF}' "$ak"
    echo
  fi
done
echo "${YEL}>> Une clé que tu ne reconnais pas = backdoor. Sur VPS neuf, il ne doit y avoir QUE tes clés.${RST}"

# ─────────────────────────────────────────────────────────────
sec "6. TÂCHES CRON (persistance malware)"
echo "[Crontabs utilisateurs]"
for u in $(cut -f1 -d: /etc/passwd); do
  ct=$(crontab -l -u "$u" 2>/dev/null)
  [ -n "$ct" ] && echo "-- $u --" && echo "$ct"
done
echo
echo "[Cron système]"
cat /etc/crontab 2>/dev/null
ls -la /etc/cron.d/ /etc/cron.daily/ /etc/cron.hourly/ 2>/dev/null
echo
echo "${YEL}>> Cherche : wget/curl vers IP inconnue, base64, scripts dans /tmp, /dev/shm.${RST}"

# ─────────────────────────────────────────────────────────────
sec "7. PROCESSUS GOURMANDS (mineur ?)"
echo "Top 10 CPU :"
ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu | head -11
echo
echo "${YEL}>> Noms suspects : xmrig, kdevtmpfsi, kinsing, *.sh aléatoires, processus dans /tmp.${RST}"
echo "Binaires lancés depuis /tmp /dev/shm /var/tmp :"
ls -la /proc/*/exe 2>/dev/null | grep -E '/tmp|/dev/shm|/var/tmp' || echo "  (rien — bon signe)"

# ─────────────────────────────────────────────────────────────
sec "8. CONNEXIONS RÉSEAU ÉTABLIES (exfil / C2 / pool de minage)"
ss -tnp state established 2>/dev/null | head -40
echo
echo "${YEL}>> Connexions sortantes vers ports 3333/4444/5555/14444 = pools de minage Monero.${RST}"

# ─────────────────────────────────────────────────────────────
sec "9. DERNIÈRES CONNEXIONS & ÉCHECS"
echo "[Dernières connexions réussies]"; last -a 2>/dev/null | head -15
echo
echo "[Échecs de login récents]"
( grep -i 'Failed password' /var/log/auth.log 2>/dev/null || journalctl -u ssh --no-pager 2>/dev/null | grep -i 'Failed password' ) | tail -10
echo "${YEL}>> Beaucoup d'échecs = brute-force en cours → installe fail2ban.${RST}"

# ─────────────────────────────────────────────────────────────
sec "10. ÉTAT DES SERVICES SENSIBLES"
for svc in redis-server redis postgresql ssh sshd fail2ban; do
  systemctl is-active "$svc" >/dev/null 2>&1 && echo "  $svc : $(systemctl is-active $svc)"
done
echo
echo "[Redis : protected-mode & bind — si déjà installé]"
for conf in /etc/redis/redis.conf /etc/redis.conf; do
  [ -f "$conf" ] && echo "$conf :" && grep -Ei '^\s*(bind|protected-mode|requirepass)' "$conf"
done

sec "FIN DU DIAGNOSTIC"
echo "Copie TOUTE la sortie ci-dessus et colle-la moi pour analyse."
