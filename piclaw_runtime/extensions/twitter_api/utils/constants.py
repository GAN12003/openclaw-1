# Twitter API constants and default headers

# Default headers for Twitter API requests
PROFILE_HEADERS = {
    'authority': 'x.com',
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    'content-type': 'application/json',
    'origin': 'https://x.com',
    'referer': 'https://x.com',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'x-active-user': 'yes',
    'x-auth-type': 'OAuth2Session',
    'x-client-language': 'en'
}

# Base URLs
BASE_URL = 'https://x.com'
API_V1_1 = f'{BASE_URL}/i/api/1.1'
API_V2 = f'{BASE_URL}/i/api/2'
API_GRAPHQL = f'{BASE_URL}/i/api/graphql'
UPLOAD_URL = 'https://upload.twitter.com/i/media/upload.json'

# Tweet URLs
TWEET_URL_WITH_USERNAME = f'{BASE_URL}/{{username}}/status/{{tweet_id}}'
TWEET_URL_WITHOUT_USERNAME = f'{BASE_URL}/i/status/{{tweet_id}}'

# GraphQL Query IDs
class GraphQLQueries:
    CREATE_TWEET = 'v0en1yVV-Ybeek8ClmXwYw'
    DELETE_TWEET = 'VaenaVgh5q5ih7kvyVjgtg'
    LIKE_TWEET = 'lI07N6Otwv1PhnEgXILM7A'
    UNLIKE_TWEET = 'ZYKSe-w7KEslx3JhSIk5LA'
    RETWEET = 'ojPdsZsimiJrUGLR1sjUtA'
    UNRETWEET = 'iQtK4dl5hBmXewYZuEOKVw'
    REPLY = 'zIdRTsSqcD6R5uMtm_N0pw'
    QUOTE = 'UYy4T67XpYXgWKOafKXB_A'
    USER_BY_SCREEN_NAME = 'sLVLhk0bGj3MVFEKTdax1w'
    USER_BY_REST_ID = 'iMuA8BNF1TsHwjiEmybpHQ'
    USER_TWEETS = 'Yy5-VUhicYcDOv-9rHH0YA'
    USER_TWEETS_AND_REPLIES = 'j1YMo3_NlWIKf90W8bY5Lw'
    CREATE_DM = 'Zrnh_0gKnvG5J4xfIk5FRA'
    USER_MEDIA = 'o_6BmCDsN8-T9gzgOS1vxg'
    USER_LIKES = 'JQPMpwZZZWGzgKvYdJMDjA'
    TWEET_DETAIL = 'TuCQPCuFXRUA9-YVnUw7Hg'
    FOLLOWERS = 'Zrj9A3nNbQngtGNnGbvDKA'
    FOLLOWING = 'BKBmHL5327XHMHl3R-DKhg'
    SEARCH = 'NA567V_8AFwu0cZEkAAKcw'
    HOME_TIMELINE = 'BKPIhjmhqGsoPsQwfKrXew'

# API Endpoints
class Endpoints:
    """Twitter API endpoints"""
    BASE_URL = "https://x.com"  # Changed back to x.com from api.twitter.com
    API_V1_1 = f"{BASE_URL}/i/api/1.1"
    API_V2 = f"{BASE_URL}/i/api/2"
    API_GRAPHQL = f"{BASE_URL}/i/api/graphql"  # Changed back to x.com from api.twitter.com
    
    # User endpoints
    VERIFY_CREDENTIALS = f"{API_V1_1}/account/update_profile.json"
    USER_BY_SCREEN_NAME = f"{API_GRAPHQL}/{GraphQLQueries.USER_BY_SCREEN_NAME}/UserByScreenName"
    USER_BY_REST_ID = f"{API_GRAPHQL}/{GraphQLQueries.USER_BY_REST_ID}/UserByRestId"
    USER_TWEETS = f"{API_GRAPHQL}/{GraphQLQueries.USER_TWEETS}"  # Will append /UserTweets in the method
    USER_TWEETS_AND_REPLIES = f"{API_GRAPHQL}/{GraphQLQueries.USER_TWEETS_AND_REPLIES}"  # Will append /UserTweetsAndReplies in the method
    USER_MEDIA = f"{API_GRAPHQL}/{GraphQLQueries.USER_MEDIA}"  # Will append /UserMedia in the method
    
    # Tweet URLs
    TWEET_URL_WITH_USERNAME = f'{BASE_URL}/{{username}}/status/{{tweet_id}}'
    TWEET_URL_WITHOUT_USERNAME = f'{BASE_URL}/i/status/{{tweet_id}}'
    
    # User-related endpoints
    UPDATE_PROFILE = f'{API_V1_1}/account/update_profile.json'
    UPDATE_PROFILE_IMAGE = f'{API_V1_1}/account/update_profile_image.json'
    UPDATE_PROFILE_BANNER = f'{API_V1_1}/account/update_profile_banner.json'
    UPDATE_PROFILE_SETTINGS = f'{API_V1_1}/account/settings.json'
    CHANGE_PASSWORD = f'{API_V1_1}/account/change_password.json'
    DELETE_PHONE = f'{API_V1_1}/account/delete_phone.json'
    CHECK_USERNAME = f'{API_V1_1}/users/username_available.json'
    NOTIFICATIONS = f'{API_V2}/notifications/all.json'
    
    # Tweet-related endpoints
    CREATE_TWEET = f'{API_GRAPHQL}/{GraphQLQueries.CREATE_TWEET}/CreateTweet'
    DELETE_TWEET = f'{API_GRAPHQL}/{GraphQLQueries.DELETE_TWEET}/DeleteTweet'
    LIKE_TWEET = f'{API_GRAPHQL}/{GraphQLQueries.LIKE_TWEET}/FavoriteTweet'
    UNLIKE_TWEET = f'{API_GRAPHQL}/{GraphQLQueries.UNLIKE_TWEET}/UnfavoriteTweet'
    RETWEET = f'{API_GRAPHQL}/{GraphQLQueries.RETWEET}/CreateRetweet'
    UNRETWEET = f'{API_GRAPHQL}/{GraphQLQueries.UNRETWEET}/DeleteRetweet'
    REPLY_TWEET = f'{API_GRAPHQL}/{GraphQLQueries.REPLY}/CreateTweet'
    QUOTE_TWEET = f'{API_GRAPHQL}/{GraphQLQueries.QUOTE}/CreateTweet'
    HOME_TIMELINE = f'{API_GRAPHQL}/{GraphQLQueries.HOME_TIMELINE}/HomeTimeline'
    
    # Relationship endpoints
    FOLLOW = f'{API_V1_1}/friendships/create.json'
    UNFOLLOW = "https://x.com/i/api/1.1/friendships/destroy.json"
    BLOCK = f'{API_V1_1}/blocks/create.json'
    UNBLOCK = f'{API_V1_1}/blocks/destroy.json'
    
    # Direct message endpoints
    CREATE_DM = f'{API_V1_1}/dm/new2.json'
    
    # Subscription endpoints
    VERIFY_SUBSCRIPTION = f'{API_GRAPHQL}/ZSf-h40cwVaFsNHK_PiHUw/PremiumHubQuery'
    CREATE_SUBSCRIPTION = f'{API_V1_1}/subscriptions/create_subscription.json'

# Common features for GraphQL requests
COMMON_FEATURES = {
    'hidden_profile_likes_enabled': True,
    'hidden_profile_subscriptions_enabled': True,
    'rweb_tipjar_consumption_enabled': True,
    'responsive_web_graphql_exclude_directive_enabled': True,
    'verified_phone_label_enabled': False,
    'subscriptions_verification_info_is_identity_verified_enabled': True,
    'subscriptions_verification_info_verified_since_enabled': True,
    'highlights_tweets_tab_ui_enabled': True,
    'responsive_web_twitter_article_notes_tab_enabled': True,
    'creator_subscriptions_tweet_preview_api_enabled': True,
    'responsive_web_graphql_skip_user_profile_image_extensions_enabled': False,
    'responsive_web_graphql_timeline_navigation_enabled': True,
    'blue_business_profile_image_shape_enabled': True,
    'responsive_web_jetfuel_frame': True,
    'responsive_web_grok_image_annotation_enabled': True,
    'responsive_web_grok_analysis_button_from_backend': True,
    'responsive_web_grok_analyze_post_followups_enabled': True,
    'premium_content_api_read_enabled': True,
    'profile_label_improvements_pcf_label_in_post_enabled': True,
    'responsive_web_grok_analyze_button_fetch_trends_enabled': True,
    'responsive_web_grok_share_attachment_enabled': True
}

# Tweet creation features
TWEET_FEATURES = {
    "c9s_tweet_anatomy_moderator_badge_enabled": True,
    "communities_web_enable_tweet_community_results_fetch": True,
    "freedom_of_speech_not_reach_fetch_enabled": True,
    "graphql_is_translatable_rweb_tweet_is_translatable_enabled": True,
    "longform_notetweets_consumption_enabled": True,
    "longform_notetweets_inline_media_enabled": True,
    "longform_notetweets_rich_text_read_enabled": True,
    "responsive_web_edit_tweet_api_enabled": True,
    "responsive_web_enhance_cards_enabled": False,
    "responsive_web_graphql_exclude_directive_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "responsive_web_graphql_timeline_navigation_enabled": True,
    "responsive_web_twitter_article_tweet_consumption_enabled": True,
    "rweb_video_timestamps_enabled": True,
    "standardized_nudges_misinfo": True,
    "tweet_awards_web_tipping_enabled": False,
    "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": True,
    "tweetypie_unmention_optimization_enabled": True,
    "verified_phone_label_enabled": False,
    "view_counts_everywhere_api_enabled": True,
    # Additional features for quote tweets
    "creator_subscriptions_quote_tweet_preview_enabled": False,
    "articles_preview_enabled": True,
    "rweb_tipjar_consumption_enabled": True,
    "tweet_with_visibility_results_prefer_gql_media_interstitial_enabled": True,
    "responsive_web_jetfuel_frame": True,
    "responsive_web_grok_image_annotation_enabled": True,
    "responsive_web_grok_analysis_button_from_backend": True,
    "responsive_web_grok_analyze_post_followups_enabled": True,
    "premium_content_api_read_enabled": True,
    "profile_label_improvements_pcf_label_in_post_enabled": True,
    "responsive_web_grok_analyze_button_fetch_trends_enabled": True,
    "responsive_web_grok_share_attachment_enabled": True
}

# User Timeline Features
USER_TWEETS_FEATURES = {
    "rweb_video_screen_enabled": False,
    "profile_label_improvements_pcf_label_in_post_enabled": True,
    "rweb_tipjar_consumption_enabled": True,
    "responsive_web_graphql_exclude_directive_enabled": True,
    "verified_phone_label_enabled": False,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_timeline_navigation_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "premium_content_api_read_enabled": False,
    "communities_web_enable_tweet_community_results_fetch": True,
    "c9s_tweet_anatomy_moderator_badge_enabled": True,
    "responsive_web_grok_analyze_button_fetch_trends_enabled": False,
    "responsive_web_grok_analyze_post_followups_enabled": True,
    "responsive_web_jetfuel_frame": False,
    "responsive_web_grok_share_attachment_enabled": True,
    "articles_preview_enabled": True,
    "responsive_web_edit_tweet_api_enabled": True,
    "graphql_is_translatable_rweb_tweet_is_translatable_enabled": True,
    "view_counts_everywhere_api_enabled": True,
    "longform_notetweets_consumption_enabled": True,
    "responsive_web_twitter_article_tweet_consumption_enabled": True,
    "tweet_awards_web_tipping_enabled": False,
    "responsive_web_grok_analysis_button_from_backend": True,
    "creator_subscriptions_quote_tweet_preview_enabled": False,
    "freedom_of_speech_not_reach_fetch_enabled": True,
    "standardized_nudges_misinfo": True,
    "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": True,
    "rweb_video_timestamps_enabled": True,
    "longform_notetweets_rich_text_read_enabled": True,
    "longform_notetweets_inline_media_enabled": True,
    "responsive_web_grok_image_annotation_enabled": False,
    "responsive_web_enhance_cards_enabled": False
}

# Field Toggles
USER_TWEETS_FIELD_TOGGLES = {
    "withArticlePlainText": False
} 