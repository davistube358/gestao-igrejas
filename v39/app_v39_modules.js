/* 2Gather v39 - adaptadores oficiais dos modulos com contratos confirmados */
(function(){
'use strict';
var V=window.G2_V39=window.G2_V39||{};
function t(n){return V.table(n)}
async function rows(q){var r=await q;if(r.error)throw r.error;return r.data||[]}
async function one(q){var r=await q;if(r.error)throw r.error;return r.data}
V.users={
 accounts:function(){return rows(t('user_accounts').select('*'))},
 churchAccess:function(userAccountId){return rows(t('church_user_access').select('*').eq('user_account_id',userAccountId))},
 profiles:function(accessId){return rows(t('user_profile_assignments').select('*,access_profiles(*)').eq('church_user_access_id',accessId))}
};
V.announcements={
 list:function(churchId){return rows(t('announcements').select('*').eq('church_id',churchId).order('publish_at',{ascending:false}))},
 save:function(x){return one(t('announcements').upsert(x).select().single())}
};
V.prayers={
 list:function(churchId){return rows(t('prayer_requests').select('*').eq('church_id',churchId).order('created_at',{ascending:false}))},
 save:function(x){return one(t('prayer_requests').upsert(x).select().single())}
};
V.privateMessages={
 conversations:function(churchId){return rows(t('private_conversations').select('*').eq('church_id',churchId))},
 participants:function(conversationId){return rows(t('private_conversation_participants').select('*').eq('conversation_id',conversationId))},
 messages:function(conversationId){return rows(t('private_messages').select('*').eq('conversation_id',conversationId).order('created_at',{ascending:true}))}
};
V.finance={
 accounts:function(churchId){return rows(t('financial_accounts').select('*').eq('church_id',churchId))},
 categories:function(churchId){return rows(t('financial_categories').select('*').eq('church_id',churchId))},
 payees:function(churchId){return rows(t('financial_payees').select('*').eq('church_id',churchId))},
 paymentMethods:function(churchId){return rows(t('financial_payment_methods').select('*').eq('church_id',churchId))}
};
V.solidarity={
 locations:function(churchId,scope){var q=t('solidarity_inventory_locations').select('*').eq('church_id',churchId);if(scope)q=q.eq('module_scope',scope);return rows(q)},
 categories:function(churchId,scope){var q=t('solidarity_product_categories').select('*').eq('church_id',churchId);if(scope)q=q.eq('module_scope',scope);return rows(q)},
 counts:function(churchId){return rows(t('solidarity_inventory_counts').select('*').eq('church_id',churchId).order('created_at',{ascending:false}))}
};
})();
