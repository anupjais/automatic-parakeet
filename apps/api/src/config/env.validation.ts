import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().port().default(3000),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),

  OBSERVE_APP_KEY: Joi.string().trim().required(),

  OBSERVE_APP_SECRET: Joi.string().trim().required(),

  // JWT Authentication
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),

  JWT_REFRESH_SECRET: Joi.string().min(32).required(),

  JWT_ACCESS_TTL: Joi.string().default('15m'),

  JWT_REFRESH_TTL: Joi.string().default('7d'),

  // Cookie Configuration
  COOKIE_SECURE: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.boolean().valid(true).default(true),
      otherwise: Joi.boolean().default(false),
    }),

  FRONTEND_ORIGIN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .uri({ scheme: ['https'] })
      .required(),
    otherwise: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .default('http://localhost:3001'),
  }),
}).prefs({
  abortEarly: false,
});
