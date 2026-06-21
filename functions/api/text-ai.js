const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function onRequestPost(context) {
  const workersAi = context.env.AI;
  const upstreamUrl = context.env.TEXT_AI_UPSTREAM_URL;
  if (!workersAi && !upstreamUrl) {
    return json(
      {
        error: 'Configure an AI binding or TEXT_AI_UPSTREAM_URL.',
      },
      503
    );
  }

  let payload = null;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  try {
    if (workersAi) {
      const model = context.env.TEXT_AI_MODEL || '@cf/meta/llama-3-8b-instruct';
      const result = await workersAi.run(model, {
        messages: Array.isArray(payload.messages) ? payload.messages : [],
        temperature: payload.temperature,
        max_tokens: payload.max_tokens,
        stream: false,
      });
      return json(result, 200);
    }

    const headers = {
      'content-type': 'application/json',
    };

    if (context.env.TEXT_AI_UPSTREAM_AUTH_BEARER) {
      headers.authorization = `Bearer ${context.env.TEXT_AI_UPSTREAM_AUTH_BEARER}`;
    }

    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const responseText = await upstreamResponse.text();

    return new Response(responseText, {
      status: upstreamResponse.status,
      headers: JSON_HEADERS,
    });
  } catch {
    return json({ error: 'Upstream Text AI request failed.' }, 503);
  }
}
