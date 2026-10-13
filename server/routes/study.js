import express, { Router } from 'express';
import { buildSession, parseDayStart, reviewCard } from '../study.js';
import { sendError } from './respond.js';

export const studyRouter = Router();
studyRouter.use(express.json({ limit: '4kb' }));

function userId(res) {
  return res.locals.session.user.id;
}

studyRouter.get('/session', async (req, res, next) => {
  try {
    res.json(await buildSession(userId(res), parseDayStart(req.query.dayStart)));
  } catch (error) {
    sendError(res, next, error);
  }
});

studyRouter.post('/review', async (req, res, next) => {
  try {
    const item = await reviewCard(userId(res), String(req.body?.cardId ?? ''), Number(req.body?.rating));
    res.json({ item });
  } catch (error) {
    sendError(res, next, error);
  }
});
