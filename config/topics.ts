import { env } from "@/config/env";

type TopicName = "profileRegistry" | "floraRegistry";

type TopicScope = "environment" | "global";

type TopicDefinition = {
  description: string;
  environment: string;
  global: string;
};

const topicDefinitions: Record<TopicName, TopicDefinition> = {
  profileRegistry: {
    description: "HCS-11 profile registry topic",
    environment: env.NEXT_PUBLIC_PROFILE_REGISTRY_TOPIC_ID,
    global:
      env.NEXT_PUBLIC_GLOBAL_PROFILE_REGISTRY_TOPIC_ID ??
      env.NEXT_PUBLIC_PROFILE_REGISTRY_TOPIC_ID,
  },
  floraRegistry: {
    description: "HCS-16 flora registry topic",
    environment: env.NEXT_PUBLIC_FLORA_REGISTRY_TOPIC_ID,
    global:
      env.NEXT_PUBLIC_GLOBAL_FLORA_REGISTRY_TOPIC_ID ??
      env.NEXT_PUBLIC_FLORA_REGISTRY_TOPIC_ID,
  },
};

export function getTopicDefinition(name: TopicName): TopicDefinition {
  return topicDefinitions[name];
}

export function getTopicId(name: TopicName, scope: TopicScope = "environment"): string {
  const definition = getTopicDefinition(name);
  return scope === "global" ? definition.global : definition.environment;
}

export function topicExplorerUrl(topicId: string): string {
  return `${env.NEXT_PUBLIC_MIRROR_NODE_URL}/topics/${topicId}`;
}
