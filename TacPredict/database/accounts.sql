-- Private Cloudflare D1 account/referral store. No wallet assets or transferable tokens.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS account_policy(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),reward_units INTEGER NOT NULL DEFAULT 100 CHECK(reward_units BETWEEN 0 AND 1000),review_required INTEGER NOT NULL DEFAULT 0 CHECK(review_required IN(0,1)),updated_at TEXT NOT NULL);
INSERT OR IGNORE INTO account_policy VALUES(1,1,100,0,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE IF NOT EXISTS account_profiles(user_id TEXT PRIMARY KEY,username TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(username) BETWEEN 3 AND 24),referral_code TEXT NOT NULL UNIQUE,referred_by TEXT REFERENCES account_profiles(user_id),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','suspended')),auth_created_at TEXT NOT NULL,created_at TEXT NOT NULL,renamed_at TEXT,CHECK(referred_by IS NULL OR referred_by<>user_id));
CREATE TABLE IF NOT EXISTS account_referral_codes(code TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES account_profiles(user_id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS account_referral_rewards(invitee_id TEXT PRIMARY KEY REFERENCES account_profiles(user_id),inviter_id TEXT NOT NULL REFERENCES account_profiles(user_id),amount_units INTEGER NOT NULL CHECK(amount_units BETWEEN 0 AND 1000),status TEXT NOT NULL CHECK(status IN('credited','pending','revoked')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,CHECK(invitee_id<>inviter_id));
CREATE INDEX IF NOT EXISTS account_reward_inviter ON account_referral_rewards(inviter_id,created_at DESC);
CREATE INDEX IF NOT EXISTS account_profile_created ON account_profiles(created_at DESC);
CREATE TABLE IF NOT EXISTS account_audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,reason TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS account_rate(user_id TEXT NOT NULL,scope TEXT NOT NULL,minute INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(user_id,scope));
CREATE TRIGGER IF NOT EXISTS account_bind_immutable BEFORE UPDATE OF referred_by ON account_profiles WHEN OLD.referred_by IS NOT NEW.referred_by BEGIN SELECT RAISE(ABORT,'Referral binding is permanent'); END;
CREATE TRIGGER IF NOT EXISTS account_code_create AFTER INSERT ON account_profiles BEGIN INSERT INTO account_referral_codes VALUES(NEW.referral_code,NEW.user_id,NEW.created_at); END;
CREATE TRIGGER IF NOT EXISTS account_reward_create AFTER INSERT ON account_profiles WHEN NEW.referred_by IS NOT NULL BEGIN
 INSERT INTO account_referral_rewards SELECT NEW.user_id,NEW.referred_by,p.reward_units,CASE WHEN p.review_required=1 OR (SELECT count(*) FROM account_referral_rewards WHERE inviter_id=NEW.referred_by AND created_at>=strftime('%Y-%m-%dT00:00:00.000Z','now'))>=10 THEN 'pending' ELSE 'credited' END,NEW.created_at,NEW.created_at FROM account_policy p WHERE p.id=1;
END;
