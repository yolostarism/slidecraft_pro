export default async function handler(req, res) {
    // 允许跨域请求（Vercel 默认行为可能需要这个，取决于你的配置）
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: '只支持 POST 请求' });
    }

    const { currentHtml, selectedTagName, userMessage } = req.body;

    // ⚠️ 在 Vercel 仪表盘的 Environment Variables 里配置 DEEPSEEK_API_KEY，不要直接写在代码里！
    // 但在本地测试时，你可以暂时写死在这里：const DEEPSEEK_API_KEY = 'sk-xxxx';
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

    if (!DEEPSEEK_API_KEY) {
        return res.status(500).json({ error: '服务器未配置 API 密钥，请联系管理员。' });
    }

    const systemPrompt = `
你是一个顶级的 PPT 设计与前端开发专家。
你的任务是根据用户的需求，修改或重写用户提供的幻灯片 HTML 代码。
要求：
1. 必须使用 Tailwind CSS 类名（如 flex, text-center, bg-blue-500）和行内 style 来实现排版与样式。
2. 幻灯片是一个 1344px * 816px 的固定比例画布。
3. 如果用户选中了某个元素（选中的元素标签为：${selectedTagName}），请重点针对该元素的上下文进行修改。如果用户是要求添加新模块，请合理布局。
4. 务必保证 HTML 结构的完整性和闭合。
5. ⚠️ 极其重要：只返回纯 HTML 代码！不要包含 \`\`\`html 这类 Markdown 标记！不要做任何解释！
`;

    try {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat', 
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `这是当前的幻灯片代码：\n${currentHtml}\n\n用户的修改指令是：${userMessage}` }
                ],
                temperature: 0.1, 
            })
        });

        const data = await response.json();
        
        if (data.choices && data.choices.length > 0) {
            let newHtml = data.choices[0].message.content.trim();
            // 清洗可能的 markdown 标记
            if (newHtml.startsWith('```html')) {
                newHtml = newHtml.replace(/^```html\n?/, '').replace(/\n?```$/, '');
            } else if (newHtml.startsWith('```')) {
                newHtml = newHtml.replace(/^```\n?/, '').replace(/\n?```$/, '');
            }
            
            res.status(200).json({ newHtml: newHtml });
        } else {
            console.error('DeepSeek Error:', data);
            res.status(500).json({ error: 'DeepSeek 返回异常', details: data });
        }
    } catch (error) {
        console.error('Fetch Error:', error);
        res.status(500).json({ error: '请求大模型失败', message: error.message });
    }
}
