const { verifyAuthToken, TOKEN_COOKIE } = require("../services/auth");

// Attaches req.userId (string) when a valid auth cookie is present, else null.
// Guests keep working — routes scope data by user or guest identity.
function authOptional(req, _res, next) {
  try {
    req.userId = verifyAuthToken(req.cookies?.[TOKEN_COOKIE]);
  } catch {
    req.userId = null;
  }
  next();
}

module.exports = { authOptional };
