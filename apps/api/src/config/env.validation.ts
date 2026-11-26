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
}).prefs({
  abortEarly: false,
});
