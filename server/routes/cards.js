import express, { Router } from 'express';
import { createCard, deleteCard, listCards, updateCard, validateCardFields } from '../cards.js';
import { sendError } from './respond.js';

export const cardsRouter = Router();
cardsRouter.use(express.json({ limit: '16kb' }));

function userId(res) {
  return res.locals.session.user.id;
}

cardsRouter.get('/', async (_req, res, next) => {
  try {
    res.json({ items: await listCards(userId(res)) });
  } catch (error) {
    sendError(res, next, error);
  }
});

cardsRouter.post('/', async (req, res, next) => {
  try {
    const fields = validateCardFields(req.body);
    if (fields.error) {
      res.status(400).json({ error: fields.error });
      return;
    }
    const card = await createCard(userId(res), String(req.body?.libraryVideoId ?? ''), fields);
    res.status(201).json({ card });
  } catch (error) {
    sendError(res, next, error);
  }
});

cardsRouter.patch('/:id', async (req, res, next) => {
  try {
    const fields = validateCardFields(req.body);
    if (fields.error) {
      res.status(400).json({ error: fields.error });
      return;
    }
    const card = await updateCard(userId(res), req.params.id, fields);
    if (!card) {
      res.status(404).json({ error: 'カードが見つかりません。' });
      return;
    }
    res.json({ card });
  } catch (error) {
    sendError(res, next, error);
  }
});

cardsRouter.delete('/:id', async (req, res, next) => {
  try {
    if (!(await deleteCard(userId(res), req.params.id))) {
      res.status(404).json({ error: 'カードが見つかりません。' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    sendError(res, next, error);
  }
});
