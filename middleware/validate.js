function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: result.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      });
    }
    req.validatedBody = result.data;
    next();
  };
}

module.exports = validate;
