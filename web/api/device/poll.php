<?php
require __DIR__ . '/../../app/bootstrap.php';

$d = current_device();
$pdo = db();

$pdo->prepare("UPDATE devices SET status='online',last_seen_at=? WHERE id=?")
    ->execute([now_utc(), $d['id']]);

$pdo->beginTransaction();

try {
    $q = $pdo->prepare(
        "SELECT cc.*,c.name campaign_name,c.scenario,c.agent_name
         FROM campaign_contacts cc
         JOIN campaigns c ON c.id=cc.campaign_id
         WHERE c.device_id=?
           AND c.status='running'
           AND cc.status='pending'
           AND (cc.next_attempt_at IS NULL OR cc.next_attempt_at<=datetime('now'))
         ORDER BY cc.id ASC
         LIMIT 1"
    );
    $q->execute([$d['id']]);
    $contact = $q->fetch();

    if (!$contact) {
        $pdo->commit();
        json_response(['ok' => true, 'job' => null, 'poll_after_seconds' => 3]);
    }

    $pdo->prepare(
        "UPDATE campaign_contacts SET status='dialing',attempts=attempts+1 WHERE id=?"
    )->execute([$contact['id']]);

    $lease = gmdate('Y-m-d H:i:s', time() + (int)cfg('job_lease_seconds', 90));

    $contactName = trim((string)($contact['customer_name'] ?? ''));
    if ($contactName === '') {
        $contactName = find_contact_name($pdo, (int)$d['id'], (string)$contact['phone_number']) ?? '';
    }

    $ins = $pdo->prepare(
        "INSERT INTO calls(
            campaign_id,contact_id,device_id,direction,phone_number,contact_name,
            status,lease_expires_at,created_at
         ) VALUES(?,?,?,'outbound',?,?, 'dialing',?,?)"
    );

    $ins->execute([
        $contact['campaign_id'],
        $contact['id'],
        $d['id'],
        $contact['phone_number'],
        $contactName !== '' ? $contactName : null,
        $lease,
        now_utc()
    ]);

    $callId = (int)$pdo->lastInsertId();
    $pdo->commit();

    json_response([
        'ok' => true,
        'job' => [
            'call_id' => $callId,
            'campaign_id' => (int)$contact['campaign_id'],
            'campaign_name' => $contact['campaign_name'],
            'phone_number' => $contact['phone_number'],
            'contact_name' => $contactName !== '' ? $contactName : null,
            'agent_name' => $contact['agent_name'],
            'scenario' => $contact['scenario'],
            'action' => 'place_ai_call'
        ],
        'lease_expires_at' => $lease . ' UTC'
    ]);
} catch (Throwable $e) {
    $pdo->rollBack();
    json_response(['ok' => false, 'error' => $e->getMessage()], 500);
}
